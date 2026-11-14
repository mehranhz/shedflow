import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BookingStatus, PaymentReceiptStatus } from '@shedflow/db';
import { Clock } from '../common/clock/clock';
import { PrismaService } from '../prisma/prisma.service';
import { hashActionToken } from './signed-action-token';
import { SignedActionTokenRepository } from './signed-action-token.repository';
import type { MultipartFile } from './multipart';

const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
const MAX_BYTES = 5 * 1024 * 1024;
const DOWNLOAD_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class PaymentReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: SignedActionTokenRepository,
    private readonly clock: Clock,
    private readonly config: ConfigService,
  ) {}

  async uploadPublic(uid: string, token: string, file: MultipartFile) {
    const booking = await this.prisma.booking.findUnique({
      where: { uid },
      include: { eventType: true },
    });
    if (!booking) {
      throw new NotFoundException('Not found');
    }
    await this.assertManageToken(booking.id, token);
    if (!booking.eventType.requiresPaymentReceipt) {
      throw new ConflictException(
        'Payment receipt is not required for this booking',
      );
    }
    if (
      booking.status !== BookingStatus.PENDING_PAYMENT &&
      booking.status !== BookingStatus.PENDING_CONFIRMATION
    ) {
      throw new ConflictException('This booking is not awaiting a receipt');
    }
    await this.store(booking.id, booking.organizationId, null, file);
    return this.prisma.booking.update({
      where: { id: booking.id },
      data: { status: BookingStatus.PENDING_CONFIRMATION },
    });
  }

  async getForStaff(organizationId: string, bookingId: string) {
    const receipt = await this.latest(organizationId, bookingId);
    if (!receipt) {
      throw new NotFoundException('Payment receipt not found');
    }
    return this.toView(receipt);
  }

  async approve(organizationId: string, bookingId: string, reviewerId: string) {
    const receipt = await this.latest(organizationId, bookingId);
    if (!receipt) {
      throw new NotFoundException('Payment receipt not found');
    }
    const now = this.clock.now();
    await this.prisma.bookingPaymentReceipt.update({
      where: { id: receipt.id },
      data: {
        status: PaymentReceiptStatus.APPROVED,
        reviewedAt: now,
        reviewedByUserId: reviewerId,
        rejectionReason: null,
      },
    });
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.CONFIRMED, holdExpiresAt: null },
    });
  }

  async reject(
    organizationId: string,
    bookingId: string,
    reviewerId: string,
    reason: string,
  ) {
    const receipt = await this.latest(organizationId, bookingId);
    if (!receipt) {
      throw new NotFoundException('Payment receipt not found');
    }
    const now = this.clock.now();
    await this.prisma.bookingPaymentReceipt.update({
      where: { id: receipt.id },
      data: {
        status: PaymentReceiptStatus.REJECTED,
        reviewedAt: now,
        reviewedByUserId: reviewerId,
        rejectionReason: reason,
      },
    });
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.PENDING_PAYMENT },
    });
  }

  async openDownload(id: string, token: string) {
    this.assertDownloadToken(id, token);
    const receipt = await this.prisma.bookingPaymentReceipt.findUnique({
      where: { id },
    });
    if (!receipt) {
      throw new NotFoundException('Not found');
    }
    return {
      path: receipt.storagePath,
      mimeType: receipt.mimeType,
      filename: receipt.originalFilename,
    };
  }

  private async store(
    bookingId: string,
    organizationId: string,
    uploadedByUserId: string | null,
    file: MultipartFile,
  ) {
    if (!ALLOWED.has(file.mimeType) || file.data.length > MAX_BYTES) {
      throw new ConflictException(
        'Receipt must be a JPEG, PNG, WebP, or PDF under 5 MB',
      );
    }
    const id = randomUUID();
    const dir = join(tmpdir(), 'shedflow-payment-receipts');
    await mkdir(dir, { recursive: true });
    const storagePath = join(dir, id);
    await writeFile(storagePath, file.data);
    return this.prisma.bookingPaymentReceipt.create({
      data: {
        id,
        bookingId,
        organizationId,
        uploadedByUserId,
        status: PaymentReceiptStatus.UPLOADED,
        storagePath,
        originalFilename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.data.length,
      },
    });
  }

  private latest(organizationId: string, bookingId: string) {
    return this.prisma.bookingPaymentReceipt.findFirst({
      where: { organizationId, bookingId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private toView(receipt: {
    id: string;
    status: PaymentReceiptStatus;
    rejectionReason: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    return {
      id: receipt.id,
      status: receipt.status,
      rejectionReason: receipt.rejectionReason,
      reviewedAt: receipt.reviewedAt,
      createdAt: receipt.createdAt,
      originalFilename: receipt.originalFilename,
      mimeType: receipt.mimeType,
      sizeBytes: receipt.sizeBytes,
      downloadUrl: `/api/bff/api/public/payment-receipts/${receipt.id}/download?token=${this.signDownload(receipt.id)}`,
    };
  }

  private signDownload(id: string): string {
    const exp = this.clock.now().getTime() + DOWNLOAD_TTL_MS;
    const body = `${id}.${exp}`;
    const sig = createHmac('sha256', this.secret()).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private assertDownloadToken(id: string, token: string): void {
    const parts = token.split('.');
    if (parts.length !== 3 || parts[0] !== id) {
      throw new UnauthorizedException('Invalid download token');
    }
    const exp = Number(parts[1]);
    if (!Number.isFinite(exp) || exp < this.clock.now().getTime()) {
      throw new UnauthorizedException('Invalid download token');
    }
    const expected = createHmac('sha256', this.secret())
      .update(`${parts[0]}.${parts[1]}`)
      .digest('base64url');
    const left = Buffer.from(expected);
    const right = Buffer.from(parts[2] ?? '');
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('Invalid download token');
    }
  }

  private async assertManageToken(bookingId: string, raw: string): Promise<void> {
    const token = await this.tokens.findByHash(hashActionToken(raw));
    if (
      !token ||
      token.bookingId !== bookingId ||
      token.purpose !== 'manage' ||
      token.expiresAt.getTime() < this.clock.now().getTime()
    ) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private secret(): string {
    return this.config.getOrThrow<string>('JWT_SECRET');
  }
}
