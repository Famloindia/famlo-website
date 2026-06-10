export type PaymentProviderName = "RAZORPAY" | "RAZORPAYX" | (string & {});

export type PaymentProviderEventProcessingStatus =
  | "received"
  | "pending"
  | "ignored_duplicate"
  | "processing"
  | "processed"
  | "failed"
  | "ignored"
  | "invalid_signature";

export type HostPayoutAccountValidationStatus =
  | "disabled"
  | "pending"
  | "validation_unavailable"
  | "validated"
  | "failed";

export type RefundRequestStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "processing"
  | "processed"
  | "failed"
  | "cancelled";

export type RefundAttemptStatus =
  | "pending"
  | "submitted"
  | "processed"
  | "failed"
  | "unknown";

export type PaymentProviderEventRecord = {
  id: string;
  provider: PaymentProviderName;
  eventId: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  rawPayload: Record<string, unknown>;
  signatureValid: boolean;
  processingStatus: PaymentProviderEventProcessingStatus;
  processedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type HostPayoutAccountRecord = {
  id: string;
  hostId: string;
  provider: PaymentProviderName;
  providerContactId: string | null;
  providerFundAccountId: string | null;
  accountHolderName: string | null;
  accountNumberMasked: string | null;
  ifsc: string | null;
  vpa: string | null;
  validationStatus: HostPayoutAccountValidationStatus;
  validationReference: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HostPayoutExecutionStatus =
  | "created"
  | "submitted"
  | "processing"
  | "processed"
  | "failed"
  | "reversed"
  | "cancelled"
  | "needs_review";

export type HostPayoutExecutionRecord = {
  id: string;
  settlementId: string;
  hostId: string;
  provider: PaymentProviderName;
  providerPayoutId: string | null;
  providerFundAccountId: string | null;
  amount: number;
  currency: string;
  referenceId: string;
  status: HostPayoutExecutionStatus;
  failureReason: string | null;
  rawResponse: Record<string, unknown>;
  initiatedBy: string | null;
  initiatedAt: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RefundRequestRecord = {
  id: string;
  bookingId: string;
  paymentId: string | null;
  reason: string | null;
  refundAmount: number;
  refundBaseAmount: number;
  refundGstAmount: number;
  status: RefundRequestStatus;
  requiresAdminApproval: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

export type RefundAttemptRecord = {
  id: string;
  refundRequestId: string;
  provider: PaymentProviderName;
  providerRefundId: string | null;
  amount: number;
  status: RefundAttemptStatus;
  rawResponse: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
