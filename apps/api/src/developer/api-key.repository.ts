import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type ApiKeyRecord = {
  id: string;
  organizationId: string;
  name: string;
  prefix: string;
  keyHash: string;
  scopes: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

@Injectable()
export class ApiKeyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    organizationId: string;
    name: string;
    prefix: string;
    keyHash: string;
    scopes: string[];
  }): Promise<ApiKeyRecord> {
    return this.prisma.apiKey.create({ data });
  }

  async findByHash(keyHash: string): Promise<ApiKeyRecord | null> {
    return this.prisma.apiKey.findUnique({ where: { keyHash } });
  }

  async listByOrganization(organizationId: string): Promise<ApiKeyRecord[]> {
    return this.prisma.apiKey.findMany({
      where: { organizationId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<ApiKeyRecord | null> {
    return this.prisma.apiKey.findFirst({ where: { id, organizationId } });
  }

  async revoke(organizationId: string, id: string): Promise<void> {
    await this.prisma.apiKey.updateMany({
      where: { id, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async touchLastUsed(id: string, at: Date): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: { lastUsedAt: at },
    });
  }
}
