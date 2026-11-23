import { openLpfUrl, sealLpfUrl } from "./sealed-url";

export { openLpfUrl, sealLpfUrl };

const RELAY_PATH = "/api/lpf/stream";

/** Hosts the relay will fetch. Configured per deployment via `LPF_STREAM_HOSTS`. */
export function isLpfStreamHost(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (process.env.LPF_STREAM_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((suffix) => host === suffix.replace(/^\./, "") || host.endsWith(suffix.startsWith(".") ? suffix : `.${suffix}`));
}

/** Client-facing relay URL for an upstream LPF playlist or segment. */
export function lpfRelayUrl(url: string): string {
  return `${RELAY_PATH}?t=${sealLpfUrl(url)}`;
}

/** Rewrites every URI of an LPF playlist to a sealed relay URL. */
export function rewriteLpfPlaylist(body: string, upstream: URL): string {
  const seal = (value: string): string => {
    if (/^(data|blob):/i.test(value)) return value;
    try {
      return lpfRelayUrl(new URL(value, upstream).toString());
    } catch {
      return value;
    }
  };
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "") return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${seal(uri)}"`);
      }
      return seal(trimmed);
    })
    .join("\n");
}
