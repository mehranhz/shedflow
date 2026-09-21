import { Injectable } from '@nestjs/common';
import { Prisma, WebhookDeliveryStatus } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';

export type WebhookEndpointRecord = {
  id: string;
  organizationId: string;
  url: string;
  secretEnc: Buffer;
  events: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type WebhookDeliveryRecord = {
  id: string;
  endpointId: string;
  eventId: string;
  status: WebhookDeliveryStatus;
  attempt: number;
  nextRetryAt: Date | null;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class WebhookEndpointRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    organizationId: string;
    url: string;
    secretEnc: Buffer;
    events: string[];
  }): Promise<WebhookEndpointRecord> {
    return this.prisma.webhookEndpoint.create({
      data: {
        organizationId: data.organizationId,
        url: data.url,
        secretEnc: data.secretEnc,
        events: data.events,
      },
    });
  }

  async listByOrganization(
    organizationId: string,
  ): Promise<WebhookEndpointRecord[]> {
    return this.prisma.webhookEndpoint.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findInOrganization(
    organizationId: string,
    id: string,
  ): Promise<WebhookEndpointRecord | null> {
    return this.prisma.webhookEndpoint.findFirst({
      where: { id, organizationId },
    });
  }

  async findActiveForOrg(
    organizationId: string,
  ): Promise<WebhookEndpointRecord[]> {
    return this.prisma.webhookEndpoint.findMany({
      where: { organizationId, isActive: true },
    });
  }

  async update(
    organizationId: string,
    id: string,
    data: { url?: string; events?: string[]; isActive?: boolean },
  ): Promise<WebhookEndpointRecord> {
    const existing = await this.findInOrganization(organizationId, id);
    if (!existing) {
      throw new Error('Webhook endpoint not found');
    }
    return this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(data.url !== undefined ? { url: data.url } : {}),
        ...(data.events !== undefined ? { events: data.events } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  async delete(organizationId: string, id: string): Promise<void> {
    await this.prisma.webhookEndpoint.deleteMany({
      where: { id, organizationId },
    });
  }

  async createDelivery(data: {
    endpointId: string;
    eventId: string;
  }): Promise<WebhookDeliveryRecord> {
    return this.prisma.webhookDelivery.create({
      data: {
        endpointId: data.endpointId,
        eventId: data.eventId,
      },
    });
  }

  async listDeliveries(
    endpointId: string,
    take = 50,
  ): Promise<WebhookDeliveryRecord[]> {
    return this.prisma.webhookDelivery.findMany({
      where: { endpointId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async findDelivery(
    endpointId: string,
    deliveryId: string,
  ): Promise<WebhookDeliveryRecord | null> {
    return this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpointId },
    });
  }

  async findDeliveryById(
    deliveryId: string,
  ): Promise<WebhookDeliveryRecord | null> {
    return this.prisma.webhookDelivery.findUnique({ where: { id: deliveryId } });
  }

  async markDelivery(
    id: string,
    data: Prisma.WebhookDeliveryUpdateInput,
  ): Promise<WebhookDeliveryRecord> {
    return this.prisma.webhookDelivery.update({ where: { id }, data });
  }
}
