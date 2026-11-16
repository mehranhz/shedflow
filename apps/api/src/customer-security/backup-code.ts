export type BackupCode = {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: Date | null;
  createdAt: Date;
};

export type CreateBackupCodeData = {
  userId: string;
  codeHash: string;
};

export type UpdateBackupCodeData = Partial<{
  usedAt: Date | null;
}>;
