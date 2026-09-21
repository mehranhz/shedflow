import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPlan, Role, WebhookDeliveryStatus } from '@shedflow/db';
import { assertSafeWebhookUrl } from '@shedflow/shared';
import type { RequestContextValue } from '../common/tenancy/request-context';
import { OrganizationRepository } from '../organizations/organization.repository';
import {
  decryptSecret,
  encryptSecret,
  generateWebhookSecret,
} from './crypto';
import { WebhookEndpointRepository } from './webhook-endpoint.repository';

@Injectable()
export class WebhooksService {
  constructor(
    private readonly endpoints: WebhookEndpointRepository,
    private readonly organizations: OrganizationRepository,
    private readonly config: ConfigService,
  ) {}

  async list(organizationId: string, ctx: RequestContextValue) {
    this.assertCanManage(ctx);
    const rows = await this.endpoints.listByOrganization(organizationId);
    return rows.map((row) => this.toPublic(row));
  }

  async create(
    organizationId: string,
    ctx: RequestContextValue,
    input: { url: string; events: string[] },
  ) {
    this.assertCanManage(ctx);
    await this.assertPro(organizationId);
    this.assertSafeUrl(input.url);

    const secret = generateWebhookSecret();
    const secretEnc = encryptSecret(
      secret,
      this.config.get<string>('TOKEN_ENCRYPTION_KEY'),
    );
    const row = await this.endpoints.create({
      organizationId,
      url: input.url,
      secretEnc,
      events: input.events,
    });

    return {
      ...this.toPublic(row),
      secret,
    };
  }

  async update(
    organizationId: string,
    id: string,
    ctx: RequestContextValue,
    input: { url?: string; events?: string[]; isActive?: boolean },
  ) {
    this.assertCanManage(ctx);
    const existing = await this.endpoints.findInOrganization(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    if (input.url) {
      this.assertSafeUrl(input.url);
    }
    const row = await this.endpoints.update(organizationId, id, input);
    return this.toPublic(row);
  }

  async remove(
    organizationId: string,
    id: string,
    ctx: RequestContextValue,
  ): Promise<void> {
    this.assertCanManage(ctx);
    const existing = await this.endpoints.findInOrganization(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    await this.endpoints.delete(organizationId, id);
  }

  async listDeliveries(
    organizationId: string,
    endpointId: string,
    ctx: RequestContextValue,
  ) {
    this.assertCanManage(ctx);
    const endpoint = await this.endpoints.findInOrganization(
      organizationId,
      endpointId,
    );
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    const rows = await this.endpoints.listDeliveries(endpointId);
    return rows.map((row) => ({
      id: row.id,
      endpointId: row.endpointId,
      eventId: row.eventId,
      status: row.status,
      attempt: row.attempt,
      nextRetryAt: row.nextRetryAt,
      lastStatus: row.lastStatus,
      lastError: row.lastError,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  /**
   * Marks a delivery PENDING and returns its id for the worker to re-enqueue.
   * The API does not talk to pg-boss; callers/worker poll PENDING with null nextRetryAt
   * or the redeliver path sets nextRetryAt=now so the worker picks it up.
   */
  async redeliver(
    organizationId: string,
    endpointId: string,
    deliveryId: string,
    ctx: RequestContextValue,
  ) {
    this.assertCanManage(ctx);
    const endpoint = await this.endpoints.findInOrganization(
      organizationId,
      endpointId,
    );
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    const delivery = await this.endpoints.findDelivery(endpointId, deliveryId);
    if (!delivery) {
      throw new NotFoundException('Webhook delivery not found');
    }

    const updated = await this.endpoints.markDelivery(deliveryId, {
      status: WebhookDeliveryStatus.PENDING,
      nextRetryAt: new Date(),
      lastError: null,
    });

    return {
      id: updated.id,
      status: updated.status,
      nextRetryAt: updated.nextRetryAt,
    };
  }

  decryptEndpointSecret(secretEnc: Buffer): string {
    return decryptSecret(
      secretEnc,
      this.config.get<string>('TOKEN_ENCRYPTION_KEY'),
    );
  }

  private assertSafeUrl(url: string): void {
    try {
      assertSafeWebhookUrl(url);
    } catch (error) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Invalid webhook URL',
      });
    }
  }

  private async assertPro(organizationId: string): Promise<void> {
    const org = await this.organizations.findActiveById(organizationId);
    if (!org || org.platformPlan !== PlatformPlan.PRO) {
      throw new ForbiddenException({
        code: 'FEATURE_GATED',
        message: 'Webhooks require a Pro workspace. Upgrade to continue.',
      });
    }
  }

  private assertCanManage(ctx: RequestContextValue): void {
    if (ctx.actorType === 'api_key') {
      return;
    }
    if (ctx.role !== Role.OWNER && ctx.role !== Role.ADMIN) {
      throw new ForbiddenException('Insufficient role');
    }
  }

  private toPublic(row: {
    id: string;
    organizationId: string;
    url: string;
    events: string[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      url: row.url,
      events: row.events,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
