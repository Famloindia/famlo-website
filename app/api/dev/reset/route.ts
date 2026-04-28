import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_TABLES = [
  "users",
  "families",
  "family_photos",
  "family_applications",
  "host_onboarding_drafts",
  "hommies",
  "city_guides",
  "activities",
  "bookings",
  "messages",
  "reviews",
  "notifications",
  "user_connections",
  "family_meals",
] as const;

type ResetRequestBody = {
  secret?: string;
};

function getResetSecret(): string {
  const secret = process.env.DEV_RESET_SECRET ?? process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("Missing DEV_RESET_SECRET or CRON_SECRET.");
  }
  return secret;
}

function getDatabaseUrl(): string {
  const url =
    process.env.SUPABASE_DB_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL;

  if (!url) {
    throw new Error("Missing SUPABASE_DB_URL, POSTGRES_URL, or DATABASE_URL.");
  }

  return url;
}

function getProvidedSecret(request: NextRequest, bodySecret?: string): string {
  const headerSecret = request.headers.get("x-dev-reset-secret")?.trim();
  if (headerSecret) return headerSecret;

  const bearer = request.headers.get("authorization")?.trim();
  if (bearer?.startsWith("Bearer ")) {
    return bearer.slice("Bearer ".length).trim();
  }

  return String(bodySecret ?? "").trim();
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

async function getRequestBody(request: NextRequest): Promise<ResetRequestBody> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    return (await request.json()) as ResetRequestBody;
  } catch {
    return {};
  }
}

async function getExistingTables(client: Client): Promise<string[]> {
  const { rows } = await client.query<{ table_name: string }>(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
    `,
    [RESET_TABLES]
  );

  const existing = new Set(rows.map((row: { table_name: string }) => row.table_name));
  return RESET_TABLES.filter((table) => existing.has(table));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const isVercelProduction = process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production";
  const isLocalProduction = process.env.VERCEL !== "1" && process.env.NODE_ENV === "production";

  if (isVercelProduction || isLocalProduction) {
    return NextResponse.json(
      { error: "This reset route is disabled in production." },
      { status: 403 }
    );
  }

  try {
    const body = await getRequestBody(request);
    const providedSecret = getProvidedSecret(request, body.secret);

    if (!providedSecret || providedSecret !== getResetSecret()) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = new Client({
      connectionString: getDatabaseUrl(),
      ssl: process.env.NODE_ENV === "development" ? false : { rejectUnauthorized: false },
    });

    await client.connect();

    try {
      const existingTables = await getExistingTables(client);

      if (existingTables.length === 0) {
        return NextResponse.json(
          { error: "None of the configured reset tables exist in public schema." },
          { status: 400 }
        );
      }

      const truncateSql = `
        TRUNCATE TABLE ${existingTables
          .map((table) => `public.${quoteIdentifier(table)}`)
          .join(", ")}
        RESTART IDENTITY CASCADE;
      `;

      await client.query("BEGIN");
      await client.query(truncateSql);
      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        truncatedTables: existingTables,
        resetAt: new Date().toISOString(),
      });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      await client.end().catch(() => undefined);
    }
  } catch (error) {
    console.error("Dev reset failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reset development data." },
      { status: 500 }
    );
  }
}
