import { openLpfUrl, sealLpfSegmentUrl, sealLpfUrl } from "./sealed-url";
import {
  deferSegmentUrl,
  r2SegmentUrl,
  r2SegmentsEnabled,
  triggerSegmentPopulate,
  type DeferredSegmentUrl,
} from "./r2-segments";

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

/**
 * Rewrites every URI of an LPF playlist. Sub-playlists stay on the relay
 * (they must stay fresh); media segments, keys and init maps go to the R2
 * CDN when `MEDIA_CDN_BASE` + `SEG_POPULATE_URL` are configured — the
 * segment token is bucket-aligned so every viewer shares one object.
 */
export function rewriteLpfPlaylist(
  body: string,
  upstream: URL,
  defer?: DeferredSegmentUrl[]
): string {
  const seal = (value: string): string => {
    if (/^(data|blob):/i.test(value)) return value;
    try {
      const absolute = new URL(value, upstream).toString();
      if (/\.m3u8(?:[?#]|$)/i.test(absolute)) return lpfRelayUrl(absolute);
      const token = sealLpfSegmentUrl(absolute);
      if (r2SegmentsEnabled()) {
        // Deferred fallback is /api/seg on Render (upstream passthrough with
        // edge-cacheable headers), not the worker, so no Worker quota is spent.
        if (defer) {
          return deferSegmentUrl("lpf", token, `/api/seg?t=${token}`, defer);
        }
        triggerSegmentPopulate("lpf", token);
        return r2SegmentUrl("lpf", token);
      }
      return `${RELAY_PATH}?t=${token}`;
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
