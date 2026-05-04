type ChannexEnvironment = "staging";

export type ChannexConfigSummary = {
  environment: ChannexEnvironment;
  apiKeyConfigured: boolean;
  baseUrlConfigured: boolean;
  configured: boolean;
};

export type ChannexConnectionCheckResult = {
  configured: boolean;
  ok: boolean;
  environment: ChannexEnvironment;
  message: string;
  endpoint: string;
  httpStatus: number | null;
};

function asString(value: string | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function loadEnvironment(): ChannexEnvironment {
  const raw = String(process.env.CHANNEX_ENV ?? "staging").trim().toLowerCase();
  return raw === "staging" ? "staging" : "staging";
}

function resolveBaseUrl(environment: ChannexEnvironment): string {
  const explicit = asString(process.env.CHANNEX_STAGING_BASE_URL);
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  if (environment === "staging") {
    return "https://staging.channex.io";
  }

  return "https://staging.channex.io";
}

function loadApiKey(environment: ChannexEnvironment): string | null {
  if (environment === "staging") {
    return asString(process.env.CHANNEX_STAGING_API_KEY);
  }
  return null;
}

export function getChannexConfigSummary(): ChannexConfigSummary {
  const environment = loadEnvironment();
  const apiKeyConfigured = Boolean(loadApiKey(environment));
  const baseUrlConfigured = Boolean(resolveBaseUrl(environment));

  return {
    environment,
    apiKeyConfigured,
    baseUrlConfigured,
    configured: apiKeyConfigured && baseUrlConfigured,
  };
}

export async function checkChannexConnection(): Promise<ChannexConnectionCheckResult> {
  const environment = loadEnvironment();
  const summary = getChannexConfigSummary();
  const endpoint = `${resolveBaseUrl(environment)}/api/v1/groups`;
  const apiKey = loadApiKey(environment);

  if (!summary.configured || !apiKey) {
    return {
      configured: false,
      ok: false,
      environment,
      message: "Channex staging configuration is incomplete. Add the server-side API key first.",
      endpoint: "/api/v1/groups",
      httpStatus: null,
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "user-api-key": apiKey,
      },
    });

    const text = await response.text();
    let parsed: Record<string, unknown> | null = null;

    if (text.trim().length > 0) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const errorTitle =
        parsed &&
        typeof parsed.errors === "object" &&
        parsed.errors &&
        "title" in parsed.errors &&
        typeof parsed.errors.title === "string"
          ? parsed.errors.title
          : null;

      return {
        configured: true,
        ok: false,
        environment,
        message: errorTitle
          ? `Channex staging check failed: ${errorTitle}.`
          : `Channex staging check failed with HTTP ${response.status}.`,
        endpoint: "/api/v1/groups",
        httpStatus: response.status,
      };
    }

    const groupsCount =
      parsed &&
      Array.isArray(parsed.data)
        ? parsed.data.length
        : null;

    return {
      configured: true,
      ok: true,
      environment,
      message:
        groupsCount != null
          ? `Connected to Channex staging. Groups endpoint responded with ${groupsCount} group records.`
          : "Connected to Channex staging. Groups endpoint responded successfully.",
      endpoint: "/api/v1/groups",
      httpStatus: response.status,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      environment,
      message: error instanceof Error ? `Channex staging check failed: ${error.message}` : "Channex staging check failed.",
      endpoint: "/api/v1/groups",
      httpStatus: null,
    };
  }
}
