-- T-073 Intake forms / waivers (+ additive Customer.userId for portal link)

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "user_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "customers_organization_id_user_id_key"
  ON "customers"("organization_id", "user_id");

CREATE INDEX IF NOT EXISTS "customers_user_id_idx" ON "customers"("user_id");

DO $$ BEGIN
  ALTER TABLE "customers"
    ADD CONSTRAINT "customers_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TYPE "FormAssignmentStatus" AS ENUM ('PENDING', 'COMPLETED');

CREATE TABLE "form_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "schema" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "required_before_confirm" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_type_form_templates" (
    "id" UUID NOT NULL,
    "event_type_id" UUID NOT NULL,
    "form_template_id" UUID NOT NULL,
    "required_before_confirm" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "event_type_form_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_assignments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "form_template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "status" "FormAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "required_before_confirm" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "form_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_submissions" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "form_template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "signature_name" TEXT,
    "waiver_accepted" BOOLEAN NOT NULL DEFAULT false,
    "signed_at" TIMESTAMPTZ(3),
    "signer_ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "form_uploads" (
    "id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "field_key" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "form_uploads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "form_templates_organization_id_is_active_idx" ON "form_templates"("organization_id", "is_active");
CREATE UNIQUE INDEX "event_type_form_templates_event_type_id_form_template_id_key" ON "event_type_form_templates"("event_type_id", "form_template_id");
CREATE UNIQUE INDEX "form_assignments_booking_id_form_template_id_key" ON "form_assignments"("booking_id", "form_template_id");
CREATE INDEX "form_assignments_organization_id_customer_id_idx" ON "form_assignments"("organization_id", "customer_id");
CREATE INDEX "form_assignments_customer_id_status_idx" ON "form_assignments"("customer_id", "status");
CREATE UNIQUE INDEX "form_submissions_assignment_id_version_key" ON "form_submissions"("assignment_id", "version");
CREATE INDEX "form_submissions_organization_id_customer_id_idx" ON "form_submissions"("organization_id", "customer_id");
CREATE INDEX "form_uploads_submission_id_idx" ON "form_uploads"("submission_id");

ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_type_form_templates" ADD CONSTRAINT "event_type_form_templates_event_type_id_fkey" FOREIGN KEY ("event_type_id") REFERENCES "event_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_type_form_templates" ADD CONSTRAINT "event_type_form_templates_form_template_id_fkey" FOREIGN KEY ("form_template_id") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_assignments" ADD CONSTRAINT "form_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_assignments" ADD CONSTRAINT "form_assignments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_assignments" ADD CONSTRAINT "form_assignments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_assignments" ADD CONSTRAINT "form_assignments_form_template_id_fkey" FOREIGN KEY ("form_template_id") REFERENCES "form_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "form_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_template_id_fkey" FOREIGN KEY ("form_template_id") REFERENCES "form_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "form_uploads" ADD CONSTRAINT "form_uploads_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "form_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
