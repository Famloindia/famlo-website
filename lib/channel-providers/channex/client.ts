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
  groupId?: string | null;
  website: string | null;
  description: string | null;
  importantInformation: string | null;
};

export type ChannexPayloadSummary = {
  title: string | null;
  currency: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  address_present: boolean;
  timezone: string | null;
  property_type: string | null;
  group_id_present: boolean;
  email_present: boolean;
  phone_present: boolean;
  zip_code_present: boolean;
  latitude_present: boolean;
  longitude_present: boolean;
  website_present: boolean;
  description_present: boolean;
  important_information_present: boolean;
};

export type ChannexCreatePropertyResult = {
  ok: boolean;
  environment: ChannexEnvironment;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  externalPropertyId: string | null;
  rawValidation: Record<string, unknown> | null;
  errorCode: string | null;
  errorTitle: string | null;
  errorDetails: Record<string, unknown> | null;
  payloadSummary: ChannexPayloadSummary;
};

export type ChannexGroupRecord = {
  id: string;
  title: string;
};

export type ChannexGroupsResult = {
  ok: boolean;
  environment: ChannexEnvironment;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  groups: ChannexGroupRecord[];
  rawValidation: Record<string, unknown> | null;
};

export type ChannexCreateRoomTypeInput = {
  propertyId: string;
  title: string;
  countOfRooms: number;
  occAdults: number;
  occChildren: number;
  occInfants: number;
  defaultOccupancy: number;
  roomKind?: "room" | "dorm";
  description?: string | null;
};

export type ChannexCreateRoomTypeResult = {
  ok: boolean;
  environment: ChannexEnvironment;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  externalRoomTypeId: string | null;
  rawValidation: Record<string, unknown> | null;
};

export type ChannexCreateRatePlanInput = {
  title: string;
  propertyId: string;
  roomTypeId: string;
  currency: string;
  mealType: string;
  occupancy: number;
};

export type ChannexCreateRatePlanResult = {
  ok: boolean;
  environment: ChannexEnvironment;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  externalRatePlanId: string | null;
  rawValidation: Record<string, unknown> | null;
};

export type ChannexAvailabilityChange = {
  propertyId: string;
  roomTypeId: string;
  dateFrom: string;
  dateTo: string;
  availability: number;
};

export type ChannexRestrictionChange = {
  propertyId: string;
  ratePlanId: string;
  dateFrom: string;
  dateTo: string;
  rate: string;
  stopSell: boolean;
  minStay: number;
};

export type ChannexAriPushResult = {
  ok: boolean;
  environment: ChannexEnvironment;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  warnings: Record<string, unknown> | null;
};

type ChannexBookingFeedRoom = {
  checkin_date?: unknown;
  checkout_date?: unknown;
  rate_plan_id?: unknown;
  room_type_id?: unknown;
  amount?: unknown;
};

type ChannexBookingFeedCustomer = {
  name?: unknown;
  surname?: unknown;
};

type ChannexBookingFeedRevision = {
  id?: unknown;
  property_id?: unknown;
  booking_id?: unknown;
  unique_id?: unknown;
  ota_reservation_code?: unknown;
  ota_name?: unknown;
  status?: unknown;
  arrival_date?: unknown;
  departure_date?: unknown;
  amount?: unknown;
  currency?: unknown;
  payment_collect?: unknown;
  payment_type?: unknown;
  inserted_at?: unknown;
  customer?: ChannexBookingFeedCustomer | null;
  rooms?: ChannexBookingFeedRoom[] | null;
};

export type ChannexBookingFeedResult = {
  ok: boolean;
  environment: ChannexEnvironment;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  revisions: ChannexBookingFeedRevision[];
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

function buildPropertyPayloadSummary(input: ChannexCreatePropertyInput): ChannexPayloadSummary {
  return {
    title: trimOrNull(input.title),
    currency: trimOrNull(input.currency),
    country: trimOrNull(input.country),
    state: trimOrNull(input.state),
    city: trimOrNull(input.city),
    address_present: Boolean(trimOrNull(input.address)),
    timezone: trimOrNull(input.timezone),
    property_type: trimOrNull(input.propertyType),
    group_id_present: Boolean(trimOrNull(input.groupId)),
    email_present: Boolean(trimOrNull(input.email)),
    phone_present: Boolean(trimOrNull(input.phone)),
    zip_code_present: Boolean(trimOrNull(input.zipCode)),
    latitude_present: Boolean(trimOrNull(input.latitude)),
    longitude_present: Boolean(trimOrNull(input.longitude)),
    website_present: Boolean(trimOrNull(input.website)),
    description_present: Boolean(trimOrNull(input.description)),
    important_information_present: Boolean(trimOrNull(input.importantInformation)),
  };
}

function extractChannexErrors(parsed: Record<string, unknown> | null): {
  rawValidation: Record<string, unknown> | null;
  errorCode: string | null;
  errorTitle: string | null;
  errorDetails: Record<string, unknown> | null;
} {
  const rawValidation =
    parsed &&
    typeof parsed.errors === "object" &&
    parsed.errors
      ? (parsed.errors as Record<string, unknown>)
      : null;

  const errorCode = typeof rawValidation?.code === "string" ? rawValidation.code : null;
  const errorTitle = typeof rawValidation?.title === "string" ? rawValidation.title : null;
  const errorDetails =
    rawValidation &&
    typeof rawValidation.details === "object" &&
    rawValidation.details &&
    !Array.isArray(rawValidation.details)
      ? (rawValidation.details as Record<string, unknown>)
      : null;

  return {
    rawValidation,
    errorCode,
    errorTitle,
    errorDetails,
  };
}

export async function createChannexProperty(
  input: ChannexCreatePropertyInput
): Promise<ChannexCreatePropertyResult> {
  const environment = loadEnvironment();
  const summary = getChannexConfigSummary();
  const endpoint = `${resolveBaseUrl(environment)}/api/v1/properties`;
  const apiKey = loadApiKey(environment);
  const payloadSummary = buildPropertyPayloadSummary(input);

  if (!summary.configured || !apiKey) {
    return {
      ok: false,
      environment,
      endpoint: "/api/v1/properties",
      httpStatus: null,
      message: "Channex staging configuration is incomplete. Add the server-side API key first.",
      externalPropertyId: null,
      rawValidation: null,
      errorCode: null,
      errorTitle: null,
      errorDetails: null,
      payloadSummary,
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
      group_id: trimOrNull(input.groupId),
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
      const { rawValidation, errorCode, errorTitle, errorDetails } = extractChannexErrors(parsed);
      const detailText = errorDetails ? ` Details: ${JSON.stringify(errorDetails)}.` : "";

      return {
        ok: false,
        environment,
        endpoint: "/api/v1/properties",
        httpStatus: response.status,
        message: errorTitle
          ? `Channex property creation failed: ${errorTitle}.${detailText}`
          : `Channex property creation failed with HTTP ${response.status}.`,
        externalPropertyId: null,
        rawValidation,
        errorCode,
        errorTitle,
        errorDetails,
        payloadSummary,
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
      errorCode: null,
      errorTitle: null,
      errorDetails: null,
      payloadSummary,
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
      errorCode: null,
      errorTitle: null,
      errorDetails: null,
      payloadSummary,
    };
  }
}

export async function fetchChannexGroups(): Promise<ChannexGroupsResult> {
  const environment = loadEnvironment();
  const summary = getChannexConfigSummary();
  const endpoint = `${resolveBaseUrl(environment)}/api/v1/groups`;
  const apiKey = loadApiKey(environment);

  if (!summary.configured || !apiKey) {
    return {
      ok: false,
      environment,
      endpoint: "/api/v1/groups",
      httpStatus: null,
      message: "Channex staging configuration is incomplete. Add the server-side API key first.",
      groups: [],
      rawValidation: null,
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
      const { rawValidation, errorTitle } = extractChannexErrors(parsed);
      return {
        ok: false,
        environment,
        endpoint: "/api/v1/groups",
        httpStatus: response.status,
        message: errorTitle
          ? `Channex groups fetch failed: ${errorTitle}.`
          : `Channex groups fetch failed with HTTP ${response.status}.`,
        groups: [],
        rawValidation,
      };
    }

    const groups = Array.isArray(parsed?.data)
      ? parsed.data
          .map((item) => {
            const record = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
            const attrs =
              record &&
              typeof record.attributes === "object" &&
              record.attributes &&
              !Array.isArray(record.attributes)
                ? (record.attributes as Record<string, unknown>)
                : null;
            const id = trimOrNull(typeof record?.id === "string" ? record.id : null);
            const title =
              trimOrNull(typeof attrs?.title === "string" ? attrs.title : null) ??
              trimOrNull(typeof record?.title === "string" ? record.title : null) ??
              "Group";
            return id ? { id, title } : null;
          })
          .filter((group): group is ChannexGroupRecord => Boolean(group))
      : [];

    return {
      ok: true,
      environment,
      endpoint: "/api/v1/groups",
      httpStatus: response.status,
      message: `Channex staging groups fetch returned ${groups.length} group${groups.length === 1 ? "" : "s"}.`,
      groups,
      rawValidation: null,
    };
  } catch (error) {
    return {
      ok: false,
      environment,
      endpoint: "/api/v1/groups",
      httpStatus: null,
      message: error instanceof Error ? `Channex groups fetch failed: ${error.message}` : "Channex groups fetch failed.",
      groups: [],
      rawValidation: null,
    };
  }
}

export async function createChannexRoomType(
  input: ChannexCreateRoomTypeInput
): Promise<ChannexCreateRoomTypeResult> {
  const environment = loadEnvironment();
  const summary = getChannexConfigSummary();
  const endpoint = `${resolveBaseUrl(environment)}/api/v1/room_types`;
  const apiKey = loadApiKey(environment);

  if (!summary.configured || !apiKey) {
    return {
      ok: false,
      environment,
      endpoint: "/api/v1/room_types",
      httpStatus: null,
      message: "Channex staging configuration is incomplete. Add the server-side API key first.",
      externalRoomTypeId: null,
      rawValidation: null,
    };
  }

  const payload = {
    room_type: compactObject({
      property_id: input.propertyId,
      title: input.title,
      count_of_rooms: input.countOfRooms,
      occ_adults: input.occAdults,
      occ_children: input.occChildren,
      occ_infants: input.occInfants,
      default_occupancy: input.defaultOccupancy,
      room_kind: input.roomKind ?? "room",
      content: trimOrNull(input.description)
        ? {
            description: trimOrNull(input.description),
          }
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
        endpoint: "/api/v1/room_types",
        httpStatus: response.status,
        message: errorTitle
          ? `Channex room type creation failed: ${errorTitle}.`
          : `Channex room type creation failed with HTTP ${response.status}.`,
        externalRoomTypeId: null,
        rawValidation: errors,
      };
    }

    const data = parsed && typeof parsed.data === "object" && parsed.data ? (parsed.data as Record<string, unknown>) : null;
    const externalRoomTypeId =
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
      endpoint: "/api/v1/room_types",
      httpStatus: response.status,
      message: externalRoomTypeId
        ? `Channex staging room type created successfully with id ${externalRoomTypeId}.`
        : "Channex staging room type created successfully.",
      externalRoomTypeId,
      rawValidation: null,
    };
  } catch (error) {
    return {
      ok: false,
      environment,
      endpoint: "/api/v1/room_types",
      httpStatus: null,
      message: error instanceof Error ? `Channex room type creation failed: ${error.message}` : "Channex room type creation failed.",
      externalRoomTypeId: null,
      rawValidation: null,
    };
  }
}

export async function createChannexRatePlan(
  input: ChannexCreateRatePlanInput
): Promise<ChannexCreateRatePlanResult> {
  const environment = loadEnvironment();
  const summary = getChannexConfigSummary();
  const endpoint = `${resolveBaseUrl(environment)}/api/v1/rate_plans`;
  const apiKey = loadApiKey(environment);

  if (!summary.configured || !apiKey) {
    return {
      ok: false,
      environment,
      endpoint: "/api/v1/rate_plans",
      httpStatus: null,
      message: "Channex staging configuration is incomplete. Add the server-side API key first.",
      externalRatePlanId: null,
      rawValidation: null,
    };
  }

  const payload = {
    rate_plan: {
      title: input.title,
      property_id: input.propertyId,
      room_type_id: input.roomTypeId,
      options: [
        {
          occupancy: input.occupancy,
          is_primary: true,
          rate: 0,
        },
      ],
      currency: input.currency,
      sell_mode: "per_room",
      rate_mode: "manual",
      meal_type: input.mealType,
      inherit_rate: false,
      inherit_closed_to_arrival: false,
      inherit_closed_to_departure: false,
      inherit_stop_sell: false,
      inherit_min_stay_arrival: false,
      inherit_min_stay_through: false,
      inherit_max_stay: false,
      inherit_max_sell: false,
      inherit_max_availability: false,
      inherit_availability_offset: false,
    },
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
        endpoint: "/api/v1/rate_plans",
        httpStatus: response.status,
        message: errorTitle
          ? `Channex rate plan creation failed: ${errorTitle}.`
          : `Channex rate plan creation failed with HTTP ${response.status}.`,
        externalRatePlanId: null,
        rawValidation: errors,
      };
    }

    const data = parsed && typeof parsed.data === "object" && parsed.data ? (parsed.data as Record<string, unknown>) : null;
    const externalRatePlanId =
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
      endpoint: "/api/v1/rate_plans",
      httpStatus: response.status,
      message: externalRatePlanId
        ? `Channex staging rate plan created successfully with id ${externalRatePlanId}.`
        : "Channex staging rate plan created successfully.",
      externalRatePlanId,
      rawValidation: null,
    };
  } catch (error) {
    return {
      ok: false,
      environment,
      endpoint: "/api/v1/rate_plans",
      httpStatus: null,
      message: error instanceof Error ? `Channex rate plan creation failed: ${error.message}` : "Channex rate plan creation failed.",
      externalRatePlanId: null,
      rawValidation: null,
    };
  }
}

async function postChannexJson(
  endpointPath: string,
  body: Record<string, unknown>
): Promise<ChannexAriPushResult> {
  const environment = loadEnvironment();
  const summary = getChannexConfigSummary();
  const endpoint = `${resolveBaseUrl(environment)}${endpointPath}`;
  const apiKey = loadApiKey(environment);

  if (!summary.configured || !apiKey) {
    return {
      ok: false,
      environment,
      endpoint: endpointPath,
      httpStatus: null,
      message: "Channex staging configuration is incomplete. Add the server-side API key first.",
      warnings: null,
    };
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
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
        endpoint: endpointPath,
        httpStatus: response.status,
        message: errorTitle
          ? `Channex ARI push failed: ${errorTitle}.`
          : `Channex ARI push failed with HTTP ${response.status}.`,
        warnings: errors,
      };
    }

    const meta =
      parsed &&
      typeof parsed.meta === "object" &&
      parsed.meta
        ? (parsed.meta as Record<string, unknown>)
        : null;
    const warnings =
      parsed &&
      typeof parsed.warnings === "object" &&
      parsed.warnings
        ? (parsed.warnings as Record<string, unknown>)
        : null;
    const message =
      meta && typeof meta.message === "string"
        ? meta.message
        : "Channex staging ARI push completed successfully.";

    return {
      ok: true,
      environment,
      endpoint: endpointPath,
      httpStatus: response.status,
      message,
      warnings,
    };
  } catch (error) {
    return {
      ok: false,
      environment,
      endpoint: endpointPath,
      httpStatus: null,
      message: error instanceof Error ? `Channex ARI push failed: ${error.message}` : "Channex ARI push failed.",
      warnings: null,
    };
  }
}

async function getChannexJson(endpointPath: string): Promise<{
  ok: boolean;
  environment: ChannexEnvironment;
  endpoint: string;
  httpStatus: number | null;
  message: string;
  data: unknown[];
  rawValidation: Record<string, unknown> | null;
}> {
  const environment = loadEnvironment();
  const summary = getChannexConfigSummary();
  const endpoint = `${resolveBaseUrl(environment)}${endpointPath}`;
  const apiKey = loadApiKey(environment);

  if (!summary.configured || !apiKey) {
    return {
      ok: false,
      environment,
      endpoint: endpointPath,
      httpStatus: null,
      message: "Channex staging configuration is incomplete. Add the server-side API key first.",
      data: [],
      rawValidation: null,
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
        endpoint: endpointPath,
        httpStatus: response.status,
        message: errorTitle
          ? `Channex read request failed: ${errorTitle}.`
          : `Channex read request failed with HTTP ${response.status}.`,
        data: [],
        rawValidation: errors,
      };
    }

    return {
      ok: true,
      environment,
      endpoint: endpointPath,
      httpStatus: response.status,
      message: "Channex staging read request completed successfully.",
      data: parsed && Array.isArray(parsed.data) ? parsed.data : [],
      rawValidation: null,
    };
  } catch (error) {
    return {
      ok: false,
      environment,
      endpoint: endpointPath,
      httpStatus: null,
      message: error instanceof Error ? `Channex read request failed: ${error.message}` : "Channex read request failed.",
      data: [],
      rawValidation: null,
    };
  }
}

export async function pushChannexAvailability(
  values: ChannexAvailabilityChange[]
): Promise<ChannexAriPushResult> {
  return postChannexJson("/api/v1/availability", {
    values: values.map((value) => ({
      property_id: value.propertyId,
      room_type_id: value.roomTypeId,
      date_from: value.dateFrom,
      date_to: value.dateTo,
      availability: value.availability,
    })),
  });
}

export async function pushChannexRestrictions(
  values: ChannexRestrictionChange[]
): Promise<ChannexAriPushResult> {
  return postChannexJson("/api/v1/restrictions", {
    values: values.map((value) => ({
      property_id: value.propertyId,
      rate_plan_id: value.ratePlanId,
      date_from: value.dateFrom,
      date_to: value.dateTo,
      rate: value.rate,
      stop_sell: value.stopSell,
      min_stay: value.minStay,
    })),
  });
}

export async function fetchChannexBookingFeed(): Promise<ChannexBookingFeedResult> {
  const result = await getChannexJson("/api/v1/booking_revisions/feed");

  return {
    ok: result.ok,
    environment: result.environment,
    endpoint: result.endpoint,
    httpStatus: result.httpStatus,
    message: result.ok
      ? `Channex staging booking feed returned ${result.data.length} revision${result.data.length === 1 ? "" : "s"}.`
      : result.message,
    revisions: result.data.filter(
      (item): item is ChannexBookingFeedRevision =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item)
    ),
    rawValidation: result.rawValidation,
  };
}
