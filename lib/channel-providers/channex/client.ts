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

export type ChannexCreatePropertyInput = {
  title: string;
  currency: string;
  email: string | null;
  phone: string | null;
  zipCode: string | null;
  country: string;
  state: string | null;
  city: string;
  address: string;
  longitude: string | null;
  latitude: string | null;
  timezone: string;
  propertyType: string;
  website: string | null;
  description: string | null;
  importantInformation: string | null;
};

export type ChannexCreatePropertyResult = {
  ok: boolean;
  environment: ChannexEnvironment;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  externalPropertyId: string | null;
  rawValidation: Record<string, unknown> | null;
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

function buildHeaders(apiKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    "user-api-key": apiKey,
  };
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
      headers: buildHeaders(apiKey),
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

function trimOrNull(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== null && entry !== undefined)
  ) as T;
}

export async function createChannexProperty(
  input: ChannexCreatePropertyInput
): Promise<ChannexCreatePropertyResult> {
  const environment = loadEnvironment();
  const summary = getChannexConfigSummary();
  const endpoint = `${resolveBaseUrl(environment)}/api/v1/properties`;
  const apiKey = loadApiKey(environment);

  if (!summary.configured || !apiKey) {
    return {
      ok: false,
      environment,
      endpoint: "/api/v1/properties",
      httpStatus: null,
      message: "Channex staging configuration is incomplete. Add the server-side API key first.",
      externalPropertyId: null,
      rawValidation: null,
    };
  }

  const payload = {
    property: compactObject({
      title: input.title,
      currency: input.currency,
      email: trimOrNull(input.email),
      phone: trimOrNull(input.phone),
      zip_code: trimOrNull(input.zipCode),
      country: input.country,
      state: trimOrNull(input.state),
      city: input.city,
      address: input.address,
      longitude: trimOrNull(input.longitude),
      latitude: trimOrNull(input.latitude),
      timezone: input.timezone,
      property_type: input.propertyType,
      website: trimOrNull(input.website),
      content:
        trimOrNull(input.description) || trimOrNull(input.importantInformation)
          ? compactObject({
              description: trimOrNull(input.description),
              important_information: trimOrNull(input.importantInformation),
            })
          : undefined,
    }),
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: buildHeaders(apiKey),
      body: JSON.stringify(payload),
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
      const errors =
        parsed &&
        typeof parsed.errors === "object" &&
        parsed.errors
          ? (parsed.errors as Record<string, unknown>)
          : null;
      const errorTitle = typeof errors?.title === "string" ? errors.title : null;

      return {
        ok: false,
        environment,
        endpoint: "/api/v1/properties",
        httpStatus: response.status,
        message: errorTitle
          ? `Channex property creation failed: ${errorTitle}.`
          : `Channex property creation failed with HTTP ${response.status}.`,
        externalPropertyId: null,
        rawValidation: errors,
      };
    }

    const data = parsed && typeof parsed.data === "object" && parsed.data ? (parsed.data as Record<string, unknown>) : null;
    const externalPropertyId =
      trimOrNull(typeof data?.id === "string" ? data.id : null) ??
      trimOrNull(
        data &&
        typeof data.attributes === "object" &&
        data.attributes &&
        typeof (data.attributes as Record<string, unknown>).id === "string"
          ? ((data.attributes as Record<string, unknown>).id as string)
          : null
      );

    return {
      ok: true,
      environment,
      endpoint: "/api/v1/properties",
      httpStatus: response.status,
      message: externalPropertyId
        ? `Channex staging property created successfully with id ${externalPropertyId}.`
        : "Channex staging property created successfully.",
      externalPropertyId,
      rawValidation: null,
    };
  } catch (error) {
    return {
      ok: false,
      environment,
      endpoint: "/api/v1/properties",
      httpStatus: null,
      message: error instanceof Error ? `Channex property creation failed: ${error.message}` : "Channex property creation failed.",
      externalPropertyId: null,
      rawValidation: null,
    };
  }
}
