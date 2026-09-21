import { Injectable } from '@nestjs/common';
import { Prisma } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';
import {
  StripeEventRecord,
  StripeEventRepository,
} from './stripe-event.repository';

@Injectable()
export class PrismaStripeEventRepository extends StripeEventRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async tryInsert(
    id: string,
    type: string,
    payload: unknown,
  ): Promise<StripeEventRecord> {
    try {
      const row = await this.prisma.stripeEvent.create({
        data: {
          id,
          type,
          payload: payload as Prisma.InputJsonValue,
        },
      });
      return this.toEntity(row);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.stripeEvent.findUnique({
          where: { id },
        });
        if (existing) {
          return this.toEntity(existing);
        }
      }
      throw error;
    }
  }

  async markProcessed(id: string): Promise<void> {
    await this.prisma.stripeEvent.update({
      where: { id },
      data: { processedAt: new Date() },
    });
  }

  private toEntity(row: {
    id: string;
    type: string;
    payload: unknown;
    processedAt: Date | null;
    createdAt: Date;
  }): StripeEventRecord {
    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      processedAt: row.processedAt,
      createdAt: row.createdAt,
    };
  }
}
