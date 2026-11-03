"use client";

import { useId, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Button, Label } from "@shedflow/ui/components";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { tokenFor } from "@/lib/booking-session";
import { trackPortalEvent } from "@/lib/portal/analytics";
import { publicScheduling } from "@/lib/scheduling";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_BYTES = 5 * 1024 * 1024;

export function PaymentInstructions({
  instructions,
  emptyHint = false,
}: {
  instructions?: string | null;
  emptyHint?: boolean;
}) {
  const t = useTranslations("booking.receipt");
  const text = instructions?.trim() ?? "";
  if (!text) {
    if (!emptyHint) {
      return null;
    }
    return <p className="text-sm text-muted-foreground">{t("instructionsMissing")}</p>;
  }
  return (
    <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-4 text-start text-sm">
      <p className="mb-2 text-base font-semibold text-foreground">{t("instructionsTitle")}</p>
      <p className="whitespace-pre-wrap leading-relaxed text-foreground">{text}</p>
    </div>
  );
}

export function PaymentReceiptUpload({
  uid,
  queryToken,
  paymentInstructions,
  showInstructions = true,
  onUploaded,
}: {
  uid: string;
  queryToken: string;
  paymentInstructions?: string | null;
  showInstructions?: boolean;
  onUploaded?: () => void;
}) {
  const t = useTranslations("booking.receipt");
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.files?.[0] ?? null;
    if (!next) {
      setFile(null);
      return;
    }
    if (next.size > MAX_BYTES) {
      toast.error(t("fileTooLarge"));
      event.target.value = "";
      setFile(null);
      return;
    }
    setFile(next);
  };

  const submit = async () => {
    if (!file || uploading) {
      return;
    }
    const token = tokenFor(uid, "manage", queryToken);
    if (!token) {
      toast.error(t("missingToken"));
      return;
    }
    setUploading(true);
    try {
      await publicScheduling.uploadPaymentReceipt(uid, token, file);
      trackPortalEvent("portal_receipt_upload", {
        booking_uid: uid,
        mime: file.type,
      });
      toast.success(t("uploadSuccess"));
      setFile(null);
      const input = inputRef.current ?? document.getElementById(inputId);
      if (input instanceof HTMLInputElement) {
        input.value = "";
      }
      onUploaded?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4 text-start">
      {showInstructions ? (
        <PaymentInstructions instructions={paymentInstructions} emptyHint />
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor={inputId}>{t("fileLabel")}</Label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={onFileChange}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => inputRef.current?.click()}
          >
            {t("chooseFile")}
          </Button>
          <p className="min-w-0 truncate text-sm text-muted-foreground">
            {file ? file.name : t("noFileChosen")}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{t("fileHint")}</p>
      </div>
      <Button
        type="button"
        className="w-full"
        disabled={!file || uploading}
        onClick={() => void submit()}
      >
        <Upload className="me-2 size-4" aria-hidden />
        {uploading ? t("uploading") : t("submit")}
      </Button>
    </div>
  );
}

export function PaymentReceiptStatus({
  status,
  rejectionReason,
}: {
  status?: string | null;
  rejectionReason?: string | null;
}) {
  const t = useTranslations("booking.receipt");
  if (!status) {
    return null;
  }
  if (status === "UPLOADED") {
    return <p className="text-sm text-muted-foreground">{t("statusUploaded")}</p>;
  }
  if (status === "REJECTED") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">{t("statusRejected")}</p>
        {rejectionReason ? (
          <p className="mt-1 text-muted-foreground">{rejectionReason}</p>
        ) : null}
      </div>
    );
  }
  if (status === "APPROVED") {
    return <p className="text-sm text-emerald-700">{t("statusApproved")}</p>;
  }
  return null;
}
