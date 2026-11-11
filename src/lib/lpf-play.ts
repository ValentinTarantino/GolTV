import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { load } from "cheerio/slim";
import { getCache, setCache } from "./cache";

const LIST_TTL = 15 * 60 * 1000;
const STREAM_TTL = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_SITEMAP_PAGES = 8;
const POST_MATCH = /\/lpf-play/i;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "es-AR,es;q=0.9",
};

const pending = new Map<string, Promise<unknown>>();

/**
 * `createDecipheriv` only exposes `setAuthTag` on the GCM overload; with a
 * runtime-built `aes-<bits>-gcm` string TypeScript falls back to the generic
 * `Decipher` type, so widen it locally.
 */
type GcmDecipher = ReturnType<typeof createDecipheriv> & {
  setAuthTag(tag: Buffer): void;
  setAAD(buffer: Buffer): void;
};

/** Public shape returned by `/api/lpf`: never carries a URL. */
export interface LpfChannel {
  id: string;
  label: string;
  number: number;
}

interface LpfIndexEntry extends LpfChannel {
  url: string;
}

function httpsUrl(value: string, base?: string): URL | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** Source base comes from the environment only, like the other scrapers. */
function sourceBase(): URL | null {
  return httpsUrl(process.env.LPF_SOURCE_URL?.trim() ?? "");
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = await getCache<T>(key);
  if (hit !== null) return hit;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight as Promise<T>;
  const work = (async () => {
    const value = await fetcher();
    if (value !== null) await setCache(key, value, ttlMs);
    return value;
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}

/** Opaque, stable, non-reversible reference. The post URL never leaves the server. */
function channelId(url: string): string {
  return "lpf_" + createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function numberFromSlug(url: string): number {
  const match = url.match(/lpf-play-(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function toEntry(url: string): LpfIndexEntry {
  const number = numberFromSlug(url);
  return {
    id: channelId(url),
    number,
    label: number > 0 ? `LPF Play ${number}` : "LPF Play",
    url,
  };
}

/** Sitemap children, or the document itself when it already lists posts. */
function sitemapLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
}

function sortEntries(entries: LpfIndexEntry[]): LpfIndexEntry[] {
  // Unnumbered "LPF Play" leads, then 1, 2, 3… ascending.
  return [...entries].sort((a, b) => {
    if (a.number === b.number) return a.label.localeCompare(b.label);
    if (a.number === 0) return -1;
    if (b.number === 0) return 1;
    return a.number - b.number;
  });
}

async function loadIndex(): Promise<LpfIndexEntry[]> {
  const base = sourceBase();
  if (!base) return [];

  return cached(`lpf:index:v2:${base.origin}`, LIST_TTL, async () => {
    const map = await fetchText(new URL("/sitemap.xml", base).toString());
    if (!map) return [] as LpfIndexEntry[];

    const children = sitemapLocations(map).filter((loc) => /sitemap\.xml\?page=/i.test(loc));
    const documents = children.length > 0 ? children.slice(0, MAX_SITEMAP_PAGES) : [new URL("/sitemap.xml", base).toString()];

    const pages = await Promise.all(documents.map((doc) => fetchText(doc)));
    const seen = new Set<string>();
    const entries: LpfIndexEntry[] = [];

    for (const page of pages) {
      if (!page) continue;
      for (const loc of sitemapLocations(page)) {
        if (!POST_MATCH.test(loc)) continue;
        const url = httpsUrl(loc);
        if (!url) continue;
        const href = url.toString();
        if (seen.has(href)) continue;
        seen.add(href);
        entries.push(toEntry(href));
      }
    }

    return sortEntries(entries);
  });
}

/** Every LPF Play reproductor the source publishes, newest first. No URLs. */
export async function listLpfChannels(): Promise<LpfChannel[]> {
  const entries = await loadIndex();
  return entries.map(({ id, label, number }) => ({ id, label, number }));
}

function base64urlToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function numericArray(source: string): number[] {
  return source
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 255);
}

/**
 * Decrypts a `div.aes-v` payload: the AES-GCM key is `_rk` unmasked with `_m`,
 * and the ciphertext carries the auth tag in its last 16 bytes (WebCrypto
 * appends it, Node expects it separate).
 */
export function decryptAesPayload(html: string): string | null {
  try {
    const $ = load(html);
    const holder = $("div.aes-v").first();
    if (!holder.length) return null;

    const ivRaw = holder.attr("data-iv") ?? "";
    const ctRaw = holder.attr("data-ct") ?? "";
    if (!ivRaw || !ctRaw) return null;

    const script = $("script")
      .map((_, el) => $(el).html() ?? "")
      .get()
      .join("\n");
    const maskMatch = script.match(/_m\s*=\s*\[([^\]]*)\]/);
    const keyMatch = script.match(/_rk\s*=\s*new Uint8Array\(\[([^\]]*)\]/);
    if (!maskMatch || !keyMatch) return null;

    const mask = numericArray(maskMatch[1]);
    const keyBytes = numericArray(keyMatch[1]);
    if (mask.length === 0 || keyBytes.length === 0) return null;
    if (![16, 24, 32].includes(keyBytes.length)) return null;

    const key = Buffer.from(keyBytes.map((byte, index) => byte ^ mask[index % mask.length]));
    const iv = base64urlToBuffer(ivRaw);
    const cipherText = base64urlToBuffer(ctRaw);
    if (iv.length !== 12 || cipherText.length <= 16) return null;

    const decipher = createDecipheriv(`aes-${key.length * 8}-gcm`, key, iv) as GcmDecipher;
    decipher.setAuthTag(cipherText.subarray(cipherText.length - 16));
    const plain = Buffer.concat([
      decipher.update(cipherText.subarray(0, cipherText.length - 16)),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

/** First `unescape('…')` payload of a post body, percent-decoded. */
function unescapePayload(html: string): string | null {
  const $ = load(html);
  const body = $(".post-body").first().html() ?? "";
  for (const match of body.matchAll(/unescape\(\s*'([^']+)'\s*\)/gi)) {
    try {
      const decoded = decodeURIComponent(match[1]);
      if (decoded.length > 0) return decoded;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** Percent-decodes when possible; the payload mixes encoded and literal text. */
function softDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Walks the two decode stages and returns the decrypted player document.
 * Exported for tests; `cfg` may live in a query string or a hash fragment,
 * which is why it is matched generically. Long `cfg` values are partially
 * percent-encoded (`%2B` instead of `+`), so the raw run has to be captured
 * up to a real delimiter before decoding.
 */
export function decodePostPlayer(postHtml: string): string | null {
  const payload = unescapePayload(postHtml);
  if (!payload) return null;

  const cfgMatch = payload.match(/cfg=([^&"'\s<>]+)/);
  if (!cfgMatch) return null;

  const inner = base64urlToBuffer(softDecode(cfgMatch[1])).toString("utf8");
  if (!/aes-v/.test(inner)) return null;

  return decryptAesPayload(inner);
}

/** The decrypted player exposes the playlist both raw and wrapped in a proxy. */
export function extractStreamUrl(playerHtml: string): string | null {
  const candidates = [...playerHtml.matchAll(/https?:\/\/[^"'\s<>\\]+?\.m3u8[^"'\s<>\\]*/gi)].map(
    (match) => match[0]
  );
  for (const candidate of candidates) {
    const wrapped = candidate.match(/[?&]url=([^&]+)/);
    const target = wrapped ? decodeURIComponent(wrapped[1]) : candidate;
    const url = httpsUrl(target);
    if (url) return url.toString();
  }
  return null;
}

/** Resolves an opaque channel id to its upstream playlist URL. */
export async function resolveLpfStream(id: string): Promise<string | null> {
  if (!/^lpf_[a-f0-9]{16}$/.test(id)) return null;

  const entries = await loadIndex();
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) return null;

  return cached<string | null>(`lpf:stream:v1:${id}`, STREAM_TTL, async () => {
    const postHtml = await fetchText(entry.url);
    if (!postHtml) return null;
    const playerHtml = decodePostPlayer(postHtml);
    if (!playerHtml) return null;
    return extractStreamUrl(playerHtml);
  });
}

/* ------------------------------------------------------------------ *
 * Sealed relay tokens
 * ------------------------------------------------------------------ */

const TOKEN_AAD = Buffer.from("goltv-lpf-relay");
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const RELAY_PATH = "/api/lpf/stream";

function tokenKey(): Buffer {
  const secret = process.env.LPF_PROXY_SECRET?.trim() || "goltv-lpf-relay";
  return createHash("sha256").update(secret).digest();
}

/** Encrypts an upstream URL so playlist and segment paths stay anonymous. */
export function sealLpfUrl(url: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const payload = Buffer.from(JSON.stringify({ u: url, e: Date.now() + TOKEN_TTL_MS }), "utf8");
  const cipherText = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([iv, cipherText, cipher.getAuthTag()]).toString("base64url");
}

/** Opens a token minted by `sealLpfUrl`; null when tampered, expired or non-https. */
export function openLpfUrl(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 12 + 17) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(raw.length - 16);
    const cipherText = raw.subarray(12, raw.length - 16);

    const decipher = createDecipheriv("aes-256-gcm", tokenKey(), iv) as GcmDecipher;
    decipher.setAAD(TOKEN_AAD);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");

    const parsed = JSON.parse(plain) as { u?: unknown; e?: unknown };
    if (typeof parsed.u !== "string" || typeof parsed.e !== "number") return null;
    if (parsed.e < Date.now()) return null;
    return httpsUrl(parsed.u)?.toString() ?? null;
  } catch {
    return null;
  }
}

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
