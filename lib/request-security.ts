export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestUrl = new URL(request.url);
  const originUrl = new URL(origin);
  if (originUrl.protocol !== requestUrl.protocol || originUrl.host !== requestUrl.host) {
    throw Object.assign(new Error("Request origin is not allowed."), { code: "invalid_origin" });
  }
}
export function getRequestIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}
