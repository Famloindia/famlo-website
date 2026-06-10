type ErrorLikeRecord = {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return asNonEmptyString(error.message) ?? fallback;
  }

  if (error && typeof error === "object") {
    const record = error as ErrorLikeRecord;
    return (
      asNonEmptyString(record.message) ??
      asNonEmptyString(record.details) ??
      asNonEmptyString(record.hint) ??
      fallback
    );
  }

  return fallback;
}

export function getErrorDiagnostics(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (error && typeof error === "object") {
    const record = error as ErrorLikeRecord;
    return {
      name: asNonEmptyString(record.name),
      message: asNonEmptyString(record.message),
      details: asNonEmptyString(record.details),
      hint: asNonEmptyString(record.hint),
      code: asNonEmptyString(record.code),
      status: typeof record.status === "number" ? record.status : record.status ?? null,
      raw: error,
    };
  }

  return {
    raw: error,
  };
}
