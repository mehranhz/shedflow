-- T-076 Documents vault (org-shared files + download audit)

CREATE TYPE "DocumentKind" AS ENUM ('FORM_SUBMISSION', 'ORG_SHARED', 'RECEIPT');

CREATE TABLE "org_shared_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_shared_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_download_audits" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID,
    "document_kind" "DocumentKind" NOT NULL,
    "document_id" UUID NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_download_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "org_shared_documents_organization_id_published_at_idx"
  ON "org_shared_documents"("organization_id", "published_at");
CREATE INDEX "document_download_audits_user_id_created_at_idx"
  ON "document_download_audits"("user_id", "created_at");
CREATE INDEX "document_download_audits_document_kind_document_id_idx"
  ON "document_download_audits"("document_kind", "document_id");

ALTER TABLE "org_shared_documents"
  ADD CONSTRAINT "org_shared_documents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_download_audits"
  ADD CONSTRAINT "document_download_audits_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_download_audits"
  ADD CONSTRAINT "document_download_audits_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
