export type CredentialField = {
  key: string; label: string; secret?: boolean; required?: boolean; placeholder?: string; help?: string;
};
export type PhoneProvider = { id: string; label: string; description: string; fields: CredentialField[] };
export type PhoneCarrier = { id: string; label: string; country: string | null; providers: string[] };
export type PhoneCatalogue = { carriers: PhoneCarrier[]; providers: PhoneProvider[]; vapiWebhookUrl: string };
export type PhoneNumber = {
  id: string; label: string | null; number: string; carrier: string; provider: string;
  status: "pending" | "verified" | "failed"; statusMessage: string | null; verifiedAt: string | null;
  isDefault: boolean; createdAt: string;
  /** Masked: secrets come back as ••••last4, never in full. */
  credentials: Record<string, string>;
};
export type PhoneNumberInput = {
  carrier?: string; provider?: string; number?: string; label?: string; credentials?: Record<string, string>;
};

/** Local state of the attach/edit form. */
export type PhoneNumberDraft = {
  id?: string;
  carrier: string;
  provider: string;
  number: string;
  label: string;
  credentials: Record<string, string>;
  /** Masked values of the stored credentials, shown as placeholders when editing. */
  stored: Record<string, string>;
};
