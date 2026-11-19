/**
 * Visitor address, as reported by the hosting proxy.
 *
 * The first `x-forwarded-for` entry is the client; the rest are proxies.
 * Server only.
 */

export function getClientIP(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || headers.get("cf-connecting-ip")?.trim() || "unknown";
}
