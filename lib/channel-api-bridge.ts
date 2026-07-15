import type { NextResponse } from "next/server";

export function buildInternalJsonRequest(input: {
  request: Request;
  pathname: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  query?: Record<string, string | null | undefined>;
}): Request {
  const url = new URL(input.request.url);
  url.pathname = input.pathname;
  url.search = "";

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (typeof value === "string" && value.trim().length > 0) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers(input.request.headers);
  if (input.method !== "GET") {
    headers.set("Content-Type", "application/json");
  }

  return new Request(url.toString(), {
    method: input.method ?? "POST",
    headers,
    body: input.method === "GET" ? undefined : JSON.stringify(input.body ?? {}),
  });
}

export async function readJsonResponse<T>(response: Response | NextResponse): Promise<T> {
  return (await response.json()) as T;
}

