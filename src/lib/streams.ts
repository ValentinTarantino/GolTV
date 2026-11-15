import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { load } from "cheerio/slim";
import { getCache, setCache } from "./cache";

/**
 * Source of the "Canales" section.
 *
 * The posts of the blog publish every channel as a player document: the post
 * body carries an `unescape(...)` payload with a `cfg` reference, and that
 * reference is the AES-GCM encrypted player. Some posts wrap the player in an
 * iframe instead, so both shapes are handled here.
 *
 * Two kinds of stream come out of those players:
 *   - HLS playlists (`.m3u8`) that the browser plays directly.
 *   - DASH manifests that come with a ClearKey, used with the Shaka player.
 *
 * Everything stays on the server: the client only ever sees opaque ids and
 * sealed relay tokens.
 */

const LIST_TTL = 15 * 60 * 1000;
const STREAM_TTL = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;
const MAX_SITEMAP_PAGES = 8;
const RELAY_PATH = "/api/canales/stream";
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "es-AR,es;q=0.9",
};

/**
 * Sports posts of the source and the label they get in the section. The
 * channels that the provider currently publishes clear are the ones that
 * play; the rest stay listed so the section does not lose entries.
 */
const SPORTS_CHANNELS: Array<[string, string]> = [
  ["espn", "ESPN 1"],
  ["espn-2", "ESPN 2"],
  ["espn-3", "ESPN 3"],
  ["espn-4", "ESPN 4"],
  ["espn-5", "ESPN 5"],
  ["espn-6", "ESPN 6"],
  ["espn-7", "ESPN 7"],
  ["espn-premium", "ESPN Premium"],
  ["fox-sports", "Fox Sports"],
  ["fox-sports-3", "Fox Sports 3"],
  ["tnt-sports", "TNT Sports Premium"],
  ["tyc-sports", "TyC Sports"],
  ["tyc-sports-2", "TyC Sports 2"],
  ["tyc-sports-internacional", "TyC Sports Internacional"],
  ["tyc-sports-play", "TyC Sports Play"],
  ["deportv", "DeporTV"],
  ["px-sports", "PX Sports"],
  ["america-sports", "America Sports"],
  ["dsports", "DSports"],
  ["dazn-1", "DAZN 1"],
  ["dazn-2", "DAZN 2"],
  ["dazn-formula-1", "DAZN Formula 1"],
  ["disney-plus", "Disney+"],
];

/** Public shape returned by `/api/canales`: never carries a URL. */
export interface CanalChannel {
  id: string;
  label: string;
  group: "lpf" | "sports";
}

/** ClearKey of an encrypted DASH channel. */
export interface CanalClearKey {
  kid: string;
  key: string;
}

/** A resolved channel: where to fetch it and how to decrypt it. */
export interface CanalSource {
  kind: "hls" | "dash";
  url: string;
  clearKey: CanalClearKey | null;
}

interface CanalIndexEntry extends CanalChannel {
  url: string;
}

const pending = new Map<string, Promise<unknown>>();

type GcmDecipher = ReturnType<typeof createDecipheriv> & {
  setAuthTag(tag: Buffer): void;
  setAAD(buffer: Buffer): void;
};

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

/** Opaque, stable, non-reversible reference. The post URL never leaves. */
export function channelId(url: string): string {
  return "can_" + createHash("sha256").update(url).digest("hex").slice(0, 16);
}

function sitemapLocations(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
}

/** Slug of a post, without the date folder and the "en vivo" suffix. */
function slugFromUrl(url: string): string {
  const file = url.split("/").pop() ?? "";
  return file.replace(/-en-vivo(?:_[\w-]+)?\.html$/i, "").replace(/\.html$/i, "");
}

function numberFromSlug(slug: string): number {
  const match = slug.match(/lpf-play-(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function toEntry(url: string): CanalIndexEntry | null {
  const slug = slugFromUrl(url);
  if (/^lpf-play(-\d+)?$/i.test(slug)) {
    const number = numberFromSlug(slug);
    return {
      id: channelId(url),
      label: number > 0 ? `LPF Play ${number}` : "LPF Play",
      group: "lpf",
      url,
    };
  }
  const sports = SPORTS_CHANNELS.find(([key]) => key === slug);
  if (!sports) return null;
  return {
    id: channelId(url),
    label: sports[1],
    group: "sports",
    url,
  };
}

function sortEntries(entries: CanalIndexEntry[]): CanalIndexEntry[] {
  const order = new Map(SPORTS_CHANNELS.map(([slug], index) => [slug, index]));
  return [...entries].sort((a, b) => {
    if (a.group !== b.group) return a.group === "lpf" ? -1 : 1;
    if (a.group === "lpf") {
      const an = numberFromSlug(slugFromUrl(a.url));
      const bn = numberFromSlug(slugFromUrl(b.url));
      if (an !== bn) return an - bn;
    } else {
      const ai = order.get(slugFromUrl(a.url)) ?? 999;
      const bi = order.get(slugFromUrl(b.url)) ?? 999;
      if (ai !== bi) return ai - bi;
    }
    return a.label.localeCompare(b.label);
  });
}

async function loadIndex(): Promise<CanalIndexEntry[]> {
  const base = sourceBase();
  if (!base) return [];

  return cached(`canales:index:v7:${base.origin}`, LIST_TTL, async () => {
    const map = await fetchText(new URL("/sitemap.xml", base).toString());
    if (!map) return [] as CanalIndexEntry[];

    const children = sitemapLocations(map).filter((loc) => /sitemap\.xml\?page=/i.test(loc));
    const documents = children.length > 0 ? children.slice(0, MAX_SITEMAP_PAGES) : [new URL("/sitemap.xml", base).toString()];

    const pages = await Promise.all(documents.map((doc) => fetchText(doc)));
    const seen = new Set<string>();
    const slugs = new Set<string>();
    const entries: CanalIndexEntry[] = [];

    for (const page of pages) {
      if (!page) continue;
      for (const loc of sitemapLocations(page)) {
        if (!/\.html$/i.test(loc)) continue;
        const url = httpsUrl(loc);
        if (!url) continue;
        const href = url.toString();
        if (seen.has(href)) continue;
        seen.add(href);
        // The source publishes a few channels twice (a dated post and its
        // renewal); only the first one is listed.
        const slug = slugFromUrl(href);
        if (slugs.has(slug)) continue;
        const entry = toEntry(href);
        if (!entry) continue;
        slugs.add(slug);
        entries.push(entry);
      }
    }

    return sortEntries(entries);
  });
}

/** Every channel of the section, with opaque ids. */
export async function listCanales(): Promise<CanalChannel[]> {
  const entries = await loadIndex();
  // Filter out LPF channels - they're already in the LPF section
  return entries
    .filter(({ group }) => group !== "lpf")
    .map(({ id, label, group }) => ({ id, label, group }));
}

/* ------------------------------------------------------------------ *
 * Player decoding
 * ------------------------------------------------------------------ */

function base64urlToBuffer(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function numericArray(source: string): number[] {
  return source
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 255);
}

/** Percent-decodes when possible; the payloads mix encoded and literal text. */
function softDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Decrypts a `div.aes-v` payload: the AES-GCM key is `_rk` unmasked with
 * `_m`, and the ciphertext carries the auth tag in its last 16 bytes.
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

/** The `cfg` reference of a player document, decoded to the document itself. */
function documentFromCfg(cfg: string): string | null {
  try {
    const inner = base64urlToBuffer(softDecode(cfg)).toString("utf8");
    return inner.includes("aes-v") ? inner : null;
  } catch {
    return null;
  }
}

/**
 * Every document that may hold the encrypted player: the post payload, the
 * `cfg` it references, and the `cfg` of any iframe the post or the payload
 * embeds.
 */
function candidateDocuments(postHtml: string): string[] {
  const docs: string[] = [];
  const payload = unescapePayload(postHtml);
  const sources: string[] = payload ? [payload] : [];

  for (const source of sources) {
    docs.push(source);
    const cfg = source.match(/cfg=([^&"'\s<>]+)/)?.[1];
    if (cfg) {
      const doc = documentFromCfg(cfg);
      if (doc) docs.push(doc);
    }
  }

  const frames = [
    ...[...postHtml.matchAll(/<iframe[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1]),
    ...sources.flatMap((source) =>
      [...source.matchAll(/<iframe[^>]*src=["']([^"']+)["']/gi)].map((m) => m[1])
    ),
  ];
  for (const frame of frames) {
    const cfg = frame.match(/[?#&]cfg=([^&#]+)/)?.[1];
    if (!cfg) continue;
    const doc = documentFromCfg(cfg);
    if (doc) docs.push(doc);
  }

  return docs;
}

/** The playlist of a player document, when it publishes one. */
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

/** Hex to base64url, the format the browser key systems expect. */
function hexToBase64Url(hex: string): string {
  return Buffer.from(hex.replace(/[^0-9a-f]/gi, ""), "hex").toString("base64url");
}

/**
 * The DASH player publishes its manifest and the ClearKey of the stream.
 * Both are needed to play an encrypted channel.
 */
export function extractDashSource(playerHtml: string): CanalSource | null {
  const manifest = playerHtml.match(/manifestUri\s*=\s*["']([^"']+)["']/)?.[1];
  if (!manifest) return null;
  const url = httpsUrl(manifest);
  if (!url) return null;

  const keysBlock = playerHtml.match(/CLEAR_KEYS\s*=\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  const pairs = [...keysBlock.matchAll(/["']([0-9a-fA-F]{32})["']\s*:\s*["']([0-9a-fA-F]{32})["']/g)];

  const clearKey = pairs.length > 0 ? { kid: hexToBase64Url(pairs[0][1]), key: hexToBase64Url(pairs[0][2]) } : null;
  return { kind: "dash", url: url.toString(), clearKey };
}

/** Resolves the playable source of a post. */
function sourceFromPost(postHtml: string): CanalSource | null {
  for (const doc of candidateDocuments(postHtml)) {
    const player = decryptAesPayload(doc);
    const candidates = [player, doc].filter((value): value is string => Boolean(value));
    for (const candidate of candidates) {
      const playlist = extractStreamUrl(candidate);
      if (playlist) return { kind: "hls", url: playlist, clearKey: null };
      const dash = extractDashSource(candidate);
      if (dash) return dash;
    }
  }
  return null;
}

/**
 * Fetches the upstream with a few retries. The CDN answers 503 fairly often
 * while a live edge rotates, and a single miss used to leave the player on a
 * black frame until the visitor reloaded the page.
 */
export async function fetchUpstream(
  url: string | URL,
  init: RequestInit & { headers?: Record<string, string> },
  attempts = 3
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store" });
      // 4xx means the asset is really not there; only 5xx is worth retrying.
      if (res.ok || res.status < 500) return res;
      lastError = new Error(`upstream ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("upstream unavailable");
}

/** Resolves an opaque channel id to its playable source. */
export async function resolveCanalById(id: string): Promise<CanalSource | null> {
  if (!/^can_[a-f0-9]{16}$/.test(id)) return null;

  const entries = await loadIndex();
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) return null;

  return cached<CanalSource | null>(`canales:stream:v3:${id}`, STREAM_TTL, async () => {
    // The post and its player document are fetched fresh every time; a cold
    // miss must not be cached, or the channel stays broken until the TTL ends.
    for (let attempt = 0; attempt < 3; attempt++) {
      const postHtml = await fetchText(entry.url);
      if (postHtml) {
        // The post is there: when no player comes out of it, that is the
        // provider's state and retrying would only waste the visitor's time.
        return sourceFromPost(postHtml);
      }
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
    return null;
  });
}

/* ------------------------------------------------------------------ *
 * Sealed relay tokens
 * ------------------------------------------------------------------ */

const TOKEN_AAD = Buffer.from("goltv-canales-relay");

function tokenKey(): Buffer {
  const secret = process.env.CANALES_PROXY_SECRET?.trim() || "goltv-canales-relay";
  return createHash("sha256").update(secret).digest();
}

/** Encrypts an upstream URL so manifest and segment paths stay anonymous. */
export function sealCanalUrl(url: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const payload = Buffer.from(JSON.stringify({ u: url, e: Date.now() + TOKEN_TTL_MS }), "utf8");
  const cipherText = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([iv, cipherText, cipher.getAuthTag()]).toString("base64url");
}

/** Opens a token minted by `sealCanalUrl`; null when tampered or expired. */
export function openCanalUrl(token: string): string | null {
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

/** Hosts the relay will fetch. Configured per deployment via `CANALES_STREAM_HOSTS`. */
export function isCanalStreamHost(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return (process.env.CANALES_STREAM_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .some((suffix) => host === suffix.replace(/^\./, "") || host.endsWith(suffix.startsWith(".") ? suffix : `.${suffix}`));
}

/** Client-facing relay URL for an upstream playlist, manifest or segment. */
export function canalRelayUrl(url: string): string {
  return `${RELAY_PATH}?t=${sealCanalUrl(url)}`;
}

/** Rewrites every URI of a playlist to a sealed relay URL. */
export function rewriteCanalPlaylist(body: string, upstream: URL): string {
  const seal = (value: string): string => {
    if (/^(data|blob):/i.test(value)) return value;
    try {
      return canalRelayUrl(new URL(value, upstream).toString());
    } catch {
      // Some playlists carry values with stray spaces; they still point to a
      // segment, so they are encoded instead of dropped.
      try {
        return canalRelayUrl(new URL(value.trim().replace(/\s+/g, "%20"), upstream).toString());
      } catch {
        return value;
      }
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

/**
 * The manifests publish their segment names with a `$RepresentationID$`
 * placeholder that has to be replaced with the id of the matching
 * `<Representation>`, otherwise the segment file does not exist.
 */
export function resolveRepresentationIds(manifest: string): string {
  const perRepresentation = manifest.replace(
    /<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/g,
    (match, attrs: string, inner: string) => {
      const id = (attrs.match(/id="([^"]+)"/) || [])[1];
      if (!id) return match;
      return `<Representation${attrs}>${inner.replace(/\$RepresentationID\$/g, id)}</Representation>`;
    }
  );

  return perRepresentation.replace(
    /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/g,
    (match, attrs: string, inner: string) => {
      const id = (inner.match(/<Representation\b[^>]*id="([^"]+)"/) || [])[1];
      if (!id) return match;
      return `<AdaptationSet${attrs}>${inner.replace(/\$RepresentationID\$/g, id)}</AdaptationSet>`;
    }
  );
}

/** DASH placeholders travel next to the sealed token, never inside it. */
const DASH_PLACEHOLDERS: Array<[string, string]> = [
  ["$Time$", "time"],
  ["$Number$", "number"],
  ["$Bandwidth$", "bandwidth"],
  ["$RepresentationID$", "representationid"],
];

/**
 * Rewrites a DASH manifest so every segment reference goes back through the
 * relay. The DRM declarations are dropped: the segments of these channels
 * come in the clear and a license request would always fail.
 */
export function rewriteCanalManifest(body: string, upstream: URL): string {
  const seal = (value: string): string => {
    if (/^(data|blob):/i.test(value)) return value;
    try {
      return canalRelayUrl(new URL(value, upstream).toString());
    } catch {
      return value;
    }
  };

  const sealTemplate = (value: string): string => {
    if (/^(data|blob):/i.test(value)) return value;
    let absolute: string;
    try {
      absolute = new URL(value, upstream).toString();
    } catch {
      return value;
    }
    const parts = [`t=${sealCanalUrl(absolute)}`];
    for (const [placeholder, name] of DASH_PLACEHOLDERS) {
      if (absolute.includes(placeholder)) parts.push(`${name}=${placeholder}`);
    }
    return `${RELAY_PATH}?${parts.join("&")}`;
  };

  const resolved = resolveRepresentationIds(body).replace(
    /<ContentProtection\b[^>]*?(?:\/>|>[\s\S]*?<\/ContentProtection>)\s*/g,
    ""
  );

  return resolved
    .replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (_match, url: string) => `<BaseURL>${seal(url)}</BaseURL>`)
    .replace(/initialization="([^"]+)"/g, (_match, url: string) => `initialization="${seal(url)}"`)
    .replace(/media="([^"]+)"/g, (_match, url: string) => `media="${sealTemplate(url)}"`);
}

/**
 * Expands the DASH placeholders of a template URL with the values the player
 * sent next to the sealed token.
 */
export function expandDashTemplate(url: string, params: URLSearchParams): string {
  let expanded = url;
  for (const [placeholder, name] of DASH_PLACEHOLDERS) {
    const value = params.get(name);
    if (value) expanded = expanded.split(placeholder).join(value);
  }
  return expanded;
}

/**
 * The upstream still carries the encryption boxes of the old feed (the `pssh`
 * of the init segment, the `senc` of the media). The media itself arrives in
 * the clear, so the boxes are renamed to `free`: the browser then treats the
 * track as unencrypted media instead of asking for a license.
 */
export function neutralizeDrmBoxes(buffer: Buffer): Buffer {
  const copy = Buffer.from(buffer);
  const swaps = ["pssh", "sinf", "senc", "saiz", "saio", "sbgp", "sgpd", "encv", "enca"];
  for (const tag of swaps) {
    const to = tag === "encv" ? "avc1" : tag === "enca" ? "mp4a" : "free";
    let index = copy.indexOf(tag);
    while (index !== -1) {
      copy.write(to, index, 4, "latin1");
      index = copy.indexOf(tag);
    }
  }
  return copy;
}
