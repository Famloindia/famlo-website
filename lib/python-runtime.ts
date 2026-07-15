export function resolvePythonBin(): string {
  const candidates = [
    process.env.PYTHON_BIN,
    process.env.CODEX_BUNDLED_PYTHON_BIN,
    "python3",
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return "python3";
}

export function toPythonRuntimeError(featureLabel: string, error: unknown): Error {
  if (typeof error === "object" && error && "code" in error && (error as { code?: string }).code === "ENOENT") {
    return new Error(
      `${featureLabel} requires a Python 3 runtime with the reportlab package available. ` +
        `Set PYTHON_BIN if python3 is not available on PATH.`
    );
  }

  return error instanceof Error ? error : new Error(`${featureLabel} failed.`);
}
