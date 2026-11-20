/**
 * Shared SSRF guard for every route that fetches a URL which did not come from
 * a hardcoded constant: `?url=` proxies, scraped embeds and sealed relays.
 *
 * Rejects loopback, private ranges, bare intranet names and cloud metadata
 * endpoints. Without this, a route that forwards a caller-supplied URL answers
 * from inside the server's own network (`http://169.254.169.254/`, `redis:6379`).
 */
export function isBlockedNetworkTarget(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home.arpa")) return true;
  if (host === "metadata.google.internal") return true;
  // Bare intranet names ("metadata", "redis") never carry a dot.
  if (!host.includes(".") && !host.includes(":")) return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  if (host.includes(":")) {
    if (host === "::1" || host === "::") return true;
    if (host.startsWith("fe80") || host.startsWith("fc") || host.startsWith("fd")) return true;
    const mapped = host.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped) return isBlockedNetworkTarget(new URL(`http://${mapped[1]}/`));
  }

  return false;
}
