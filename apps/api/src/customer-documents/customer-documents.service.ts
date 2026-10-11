import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentKind } from '@shedflow/db';
import { PrismaService } from '../prisma/prisma.service';

export type VaultDocument = {
  id: string;
  kind: DocumentKind;
  title: string;
  organizationId: string | null;
  organizationName: string | null;
  mimeType: string;
  createdAt: Date;
  downloadPath: string;
};

@Injectable()
export class CustomerDocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, query?: { q?: string; organizationId?: string }) {
    const customers = await this.prisma.customer.findMany({
      where: { userId },
      select: { id: true, organizationId: true },
    });
    const customerIds = customers.map((c) => c.id);
    const orgIds = [
      ...new Set(
        customers
          .map((c) => c.organizationId)
          .filter((id) =>
            query?.organizationId ? id === query.organizationId : true,
          ),
      ),
    ];

    const submissions =
      customerIds.length === 0
        ? []
        : await this.prisma.formSubmission.findMany({
            where: {
              customerId: { in: customerIds },
              ...(query?.organizationId
                ? { organizationId: query.organizationId }
                : {}),
            },
            include: {
              formTemplate: { select: { name: true } },
              organization: { select: { id: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
          });

    const shared =
      orgIds.length === 0
        ? []
        : await this.prisma.orgSharedDocument.findMany({
            where: {
              organizationId: { in: orgIds },
              publishedAt: { not: null },
            },
            include: { organization: { select: { id: true, name: true } } },
            orderBy: { publishedAt: 'desc' },
          });

    // Receipt stub until Wave 13 payments list exists (T-061).
    const receipts: VaultDocument[] = [];

    const docs: VaultDocument[] = [
      ...submissions.map((s) => ({
        id: s.id,
        kind: DocumentKind.FORM_SUBMISSION,
        title: s.formTemplate.name,
        organizationId: s.organization.id,
        organizationName: s.organization.name,
        mimeType: 'application/json',
        createdAt: s.createdAt,
        downloadPath: `/v1/customer/documents/form-submissions/${s.id}/download`,
      })),
      ...shared.map((d) => ({
        id: d.id,
        kind: DocumentKind.ORG_SHARED,
        title: d.title,
        organizationId: d.organization.id,
        organizationName: d.organization.name,
        mimeType: d.mimeType,
        createdAt: d.publishedAt ?? d.createdAt,
        downloadPath: `/v1/customer/documents/shared/${d.id}/download`,
      })),
      ...receipts,
    ];

    const q = query?.q?.trim().toLowerCase();
    const filtered = q
      ? docs.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            (d.organizationName?.toLowerCase().includes(q) ?? false),
        )
      : docs;

    return filtered.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  async downloadFormSubmission(
    userId: string,
    submissionId: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const submission = await this.prisma.formSubmission.findUnique({
      where: { id: submissionId },
      include: {
        customer: true,
        formTemplate: true,
      },
    });
    if (!submission || submission.customer.userId !== userId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Document not found',
      });
    }
    await this.audit(userId, {
      organizationId: submission.organizationId,
      documentKind: DocumentKind.FORM_SUBMISSION,
      documentId: submission.id,
      ...meta,
    });
    return {
      filename: `${submission.formTemplate.name}-v${submission.version}.json`,
      mimeType: 'application/json',
      body: JSON.stringify(
        {
          answers: submission.answers,
          signatureName: submission.signatureName,
          waiverAccepted: submission.waiverAccepted,
          signedAt: submission.signedAt,
          version: submission.version,
        },
        null,
        2,
      ),
    };
  }

  async downloadShared(
    userId: string,
    documentId: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const doc = await this.prisma.orgSharedDocument.findUnique({
      where: { id: documentId },
    });
    if (!doc || !doc.publishedAt) {
      throw new NotFoundException('Document not found');
    }
    const linked = await this.prisma.customer.findFirst({
      where: { userId, organizationId: doc.organizationId },
    });
    if (!linked) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Document not found',
      });
    }
    await this.audit(userId, {
      organizationId: doc.organizationId,
      documentKind: DocumentKind.ORG_SHARED,
      documentId: doc.id,
      ...meta,
    });
    return {
      filename: doc.title,
      mimeType: doc.mimeType,
      body: `Org shared document placeholder: ${doc.storageKey}`,
      storageKey: doc.storageKey,
    };
  }

  private async audit(
    userId: string,
    input: {
      organizationId: string | null;
      documentKind: DocumentKind;
      documentId: string;
      ip?: string;
      userAgent?: string;
    },
  ) {
    await this.prisma.documentDownloadAudit.create({
      data: {
        userId,
        organizationId: input.organizationId,
        documentKind: input.documentKind,
        documentId: input.documentId,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  }
}
