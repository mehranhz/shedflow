import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PlatformPlan, Role } from '@shedflow/db';
import { OrganizationRepository } from '../organizations/organization.repository';
import type { RequestContextValue } from '../common/tenancy/request-context';
import { ApiKeyRepository } from './api-key.repository';
import { generateApiKeySecret } from './crypto';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly apiKeys: ApiKeyRepository,
    private readonly organizations: OrganizationRepository,
  ) {}

  async list(organizationId: string, ctx: RequestContextValue) {
    this.assertDashboardAdmin(ctx);
    const keys = await this.apiKeys.listByOrganization(organizationId);
    return keys.map((key) => this.toPublic(key));
  }

  async create(
    organizationId: string,
    ctx: RequestContextValue,
    input: { name: string; scopes: string[] },
  ) {
    this.assertDashboardAdmin(ctx);
    await this.assertPro(organizationId);

    const generated = generateApiKeySecret();
    const key = await this.apiKeys.create({
      organizationId,
      name: input.name.trim(),
      prefix: generated.prefix,
      keyHash: generated.keyHash,
      scopes: input.scopes,
    });

    return {
      ...this.toPublic(key),
      secret: generated.secret,
    };
  }

  async revoke(
    organizationId: string,
    id: string,
    ctx: RequestContextValue,
  ): Promise<void> {
    this.assertDashboardAdmin(ctx);
    const existing = await this.apiKeys.findInOrganization(organizationId, id);
    if (!existing || existing.revokedAt) {
      throw new NotFoundException('API key not found');
    }
    await this.apiKeys.revoke(organizationId, id);
  }

  private async assertPro(organizationId: string): Promise<void> {
    const org = await this.organizations.findActiveById(organizationId);
    if (!org || org.platformPlan !== PlatformPlan.PRO) {
      throw new ForbiddenException({
        code: 'FEATURE_GATED',
        message: 'API keys require a Pro workspace. Upgrade to continue.',
      });
    }
  }

  private assertDashboardAdmin(ctx: RequestContextValue): void {
    if (ctx.actorType === 'api_key') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'API key management requires a dashboard session',
      });
    }
    if (ctx.role !== Role.OWNER && ctx.role !== Role.ADMIN) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private toPublic(key: {
    id: string;
    organizationId: string;
    name: string;
    prefix: string;
    scopes: string[];
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: key.id,
      organizationId: key.organizationId,
      name: key.name,
      prefix: key.prefix,
      scopes: key.scopes,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      createdAt: key.createdAt,
    };
  }
}
