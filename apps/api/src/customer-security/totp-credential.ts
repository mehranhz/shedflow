export type TotpCredential = {
  id: string;
  userId: string;
  pendingSecretCiphertext: string | null;
  secretCiphertext: string | null;
  enabledAt: Date | null;
  failedAttempts: number;
  windowStartedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateTotpCredentialData = {
  userId: string;
  pendingSecretCiphertext: string | null;
  secretCiphertext?: string | null;
  enabledAt?: Date | null;
  failedAttempts?: number;
  windowStartedAt?: Date | null;
};

export type UpdateTotpCredentialData = Partial<{
  pendingSecretCiphertext: string | null;
  secretCiphertext: string | null;
  enabledAt: Date | null;
  failedAttempts: number;
  windowStartedAt: Date | null;
}>;
