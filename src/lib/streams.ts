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
/** The channel catalog of the embed app changes rarely; ten minutes is safe. */
const EMBED_TTL = 10 * 60 * 1000;
/** Catalog published by the embed app when its own URL does not name a repo. */
const EMBED_REPO_FALLBACK = "el20chinitdt/Automatizador-de-Tokens";

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
  /** `iframe`: a third party player page, the only shape some posts have. */
  kind: "hls" | "dash" | "iframe";
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

async function loadIndex(): Promise<CanalIndexEntry[] | null> {
  const base = sourceBase();
  if (!base) return [];

  // A failed fetch returns null so `cached` does not store it: an empty list
  // cached for LIST_TTL used to leave production without channels until the
  // TTL expired, even after the upstream recovered.
  return cached<CanalIndexEntry[] | null>(`canales:index:v7:${base.origin}`, LIST_TTL, async () => {
    const map = await fetchText(new URL("/sitemap.xml", base).toString());
    if (!map) return null;

    const children = sitemapLocations(map).filter((loc) => /sitemap\.xml\?page=/i.test(loc));
    const documents = children.length > 0 ? children.slice(0, MAX_SITEMAP_PAGES) : [new URL("/sitemap.xml", base).toString()];

    const pages = await Promise.all(documents.map((doc) => fetchText(doc)));
    if (pages.every((page) => page === null)) return null;
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

/** Every channel of the section, with opaque ids. Null when the source is down. */
export async function listCanales(): Promise<CanalChannel[] | null> {
  const entries = await loadIndex();
  if (entries === null) return null;
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
 * Decrypts a `div.aes-v` payload. Two key shapes are published:
 *   - `_rk` unmasked with `_m`, the most common one,
 *   - a plain `Uint8Array` (`kb`/`k`) that already is the AES key.
 * The ciphertext carries the auth tag in its last 16 bytes.
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

    const iv = base64urlToBuffer(ivRaw);
    const cipherText = base64urlToBuffer(ctRaw);
    if (iv.length !== 12 || cipherText.length <= 16) return null;

    const candidates: Buffer[] = [];
    const mask = numericArray(script.match(/_m\s*=\s*\[([^\]]*)\]/)?.[1] ?? "");
    const masked = script.match(/_rk\s*=\s*new Uint8Array\(\[([^\]]*)\]/)?.[1] ?? "";
    if (masked && mask.length > 0) {
      const bytes = numericArray(masked);
      if ([16, 24, 32].includes(bytes.length)) {
        candidates.push(Buffer.from(bytes.map((byte, index) => byte ^ mask[index % mask.length])));
      }
    }
    for (const match of script.matchAll(/new Uint8Array\(\[([^\]]*)\]/g)) {
      const bytes = numericArray(match[1]);
      if ([16, 24, 32].includes(bytes.length)) candidates.push(Buffer.from(bytes));
    }

    const body = cipherText.subarray(0, cipherText.length - 16);
    const tag = cipherText.subarray(cipherText.length - 16);

    for (const key of candidates) {
      try {
        const decipher = createDecipheriv(`aes-${key.length * 8}-gcm`, key, iv) as GcmDecipher;
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
      } catch {
        /* wrong key; try the next shape */
      }
    }

    return null;
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

/** Every `cfg` reference of a document, in the `?cfg=` and `#cfg=` shapes. */
function cfgReferences(source: string): string[] {
  return [...source.matchAll(/cfg=([^&"'\s<>]+)/gi)].map((match) => match[1]).filter(Boolean);
}

/**
 * The documents of a post, one level per `cfg`: the post payload, and the
 * `cfg` of every iframe it holds. The providers nest this chain (post →
 * player document → player app), so it is walked breadth first instead of
 * assuming a fixed depth.
 */
function candidateDocuments(postHtml: string, maxDepth = 5): string[] {
  const docs: string[] = [];
  const seen = new Set<string>();
  const pending: string[] = [];

  const payload = unescapePayload(postHtml);
  if (payload) pending.push(payload);
  for (const match of postHtml.matchAll(/<iframe[^>]*src=["']([^"']+)["']/gi)) {
    pending.push(match[1]);
  }

  for (let depth = 0; depth < maxDepth && pending.length > 0; depth++) {
    const next: string[] = [];
    for (const source of pending.splice(0)) {
      if (seen.has(source)) continue;
      seen.add(source);
      docs.push(source);

      // A decrypted document may hold another sealed player, so its own
      // references are queued as well.
      const player = decryptAesPayload(source);
      const nested = player ? [source, player] : [source];
      for (const text of nested) {
        for (const cfg of cfgReferences(text)) {
          const doc = documentFromCfg(cfg);
          if (doc && !seen.has(doc)) next.push(doc);
        }
      }
    }
    pending.push(...next);
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
    // Some players wrap a plain `http` playlist in an `https` proxy; the
    // wrapper is the only address the relay can fetch.
    const url = httpsUrl(target) ?? (wrapped ? httpsUrl(candidate) : null);
    if (url) return url.toString();
  }
  return null;
}

/**
 * The DASH manifest of a player document. Some players publish it behind a
 * proxy parameter (`?url=…`), exactly like the HLS playlists.
 */
export function extractDashUrl(playerHtml: string): string | null {
  const candidates = [...playerHtml.matchAll(/https?:\/\/[^"'\s<>\\]+?\.mpd[^"'\s<>\\]*/gi)].map(
    (match) => match[0]
  );
  for (const candidate of candidates) {
    const wrapped = candidate.match(/[?&]url=([^&]+)/);
    const target = wrapped ? decodeURIComponent(wrapped[1]) : candidate;
    const url = httpsUrl(target) ?? (wrapped ? httpsUrl(candidate) : null);
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

/* ------------------------------------------------------------------ *
 * Embed catalog (the current shape of the player documents)
 * ------------------------------------------------------------------ */

interface EmbedBlob {
  version?: number;
  xor?: boolean;
  iv?: string;
  data?: string;
  k?: string;
  sha256?: string;
  salt?: string;
  hash?: string;
}

interface EmbedCanal {
  name?: unknown;
  path?: unknown;
  clearkey?: unknown;
}

interface EmbedConfig {
  baseUrl?: unknown;
  token?: unknown;
  canal?: unknown;
  canales?: unknown;
}

function unhex(value: string): Buffer {
  return Buffer.from(value.replace(/[^0-9a-f]/gi, ""), "hex");
}

/** Repeating XOR, exactly as the embed app does it before AES-GCM. */
function xorKeyStream(data: Buffer, key: Buffer): Buffer {
  const out = Buffer.allocUnsafe(data.length);
  for (let index = 0; index < data.length; index++) {
    out[index] = data[index] ^ key[index % key.length];
  }
  return out;
}

/**
 * Decrypts one entry of the public catalog: the AES-GCM key travels in the
 * same blob (`k`), so the whole thing is obfuscation, not a secret. The
 * payload is the base URL, the token and the channel of the provider.
 */
export function decryptEmbedPayload(blob: EmbedBlob): string | null {
  try {
    const version = Number(blob.version);
    if (![4, 5, 6].includes(version)) return null;

    const keyBytes = unhex(String(blob.k ?? ""));
    if (![16, 24, 32].includes(keyBytes.length)) return null;

    const iv = Buffer.from(String(blob.iv ?? ""), "base64");
    if (iv.length !== 12) return null;

    let data: Buffer = Buffer.from(String(blob.data ?? ""), "base64");
    if (data.length <= 16) return null;

    if (blob.sha256) {
      const digest = createHash("sha256").update(data).digest("hex");
      if (digest !== String(blob.sha256)) return null;
    }

    // Version 5 onwards always applies the XOR layer.
    if (blob.xor || version >= 5) data = xorKeyStream(data, keyBytes);

    const decipher = createDecipheriv(`aes-${keyBytes.length * 8}-gcm`, keyBytes, iv) as GcmDecipher;
    decipher.setAAD(Buffer.from(`elchini-embed-v${version}`));
    decipher.setAuthTag(data.subarray(data.length - 16));
    const plain = Buffer.concat([
      decipher.update(data.subarray(0, data.length - 16)),
      decipher.final(),
    ]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Protected embed keys (v6 blobs)
 *
 * The catalog no longer ships the AES key inside each blob. Instead the
 * key lives in a per-channel binary module (`embeds/<hash>.bin`) whose
 * 60-byte records are AES-GCM sealed with a key derived from the caller
 * origin, and the plaintext is passed through a deterministic WebGL
 * scramble. Both layers are replicated here so the server can resolve
 * the same streams the embed app would.
 * ------------------------------------------------------------------ */

/** Origins the provider accepts as callers of its embed app. */
const EMBED_ALLOWED_ORIGINS = [
  "https://el20chinitdt.github.io",
  "https://encrypthtmlaes256.edgeone.app",
  "https://isdntek.com",
  "https://canalesenvivodeargentina.blogspot.com",
];

/** Mirrors `getRepoFileSources` of the embed app, minus the relative one. */
function embedFileUrls(repo: string, filePath: string): string[] {
  const [owner, name] = repo.split("/");
  if (!owner || !name) return [];
  const host = `${owner.toLowerCase()}.github.io`;
  const pagesBase = name.toLowerCase() === host ? `https://${host}` : `https://${host}/${name}`;
  const stamp = `?t=${Date.now()}`;
  return [
    `${pagesBase}/${filePath}${stamp}`,
    `https://raw.githubusercontent.com/${owner}/${name}/refs/heads/main/${filePath}${stamp}`,
    `https://raw.githubusercontent.com/${owner}/${name}/master/${filePath}${stamp}`,
  ];
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * The WebGL "scramble" is a fixed per-pass byte rotation, not real GPU
 * work: for pass `i`, pixel `x` and channel `ch` the shader subtracts
 * `mod(i*37 + x*11 + ch*53 + 17, 251) + 1`. `unscramble` applies the
 * inverse eight times, exactly like `unscrambleBytes16`.
 */
function webglUnscramble16(input: Buffer): Buffer {
  const out = Buffer.from(input);
  for (let pass = 1; pass <= 8; pass++) {
    for (let x = 0; x < 4; x++) {
      for (let ch = 0; ch < 4; ch++) {
        const index = x * 4 + ch;
        const k = ((pass * 37 + x * 11 + ch * 53 + 17) % 251) + 1;
        out[index] = (out[index] - k + 256) % 256;
      }
    }
  }
  return out;
}

function unscrambleHex32(input: Buffer): string {
  if (input.length !== 32) return "";
  return Buffer.concat([webglUnscramble16(input.subarray(0, 16)), webglUnscramble16(input.subarray(16, 32))]).toString("hex");
}

/**
 * Recovers the per-channel AES key of a v6 blob from its protected binary
 * module. The module records are sealed with a key derived from an allowed
 * caller origin; trying each one mirrors what the browser does with
 * `ancestorOrigins`.
 */
async function embedKeyFromBin(repo: string, sid: string, saltB64: string): Promise<string | null> {
  const binHash = createHash("sha256").update(`elchini-bin-v7:${sid}:${saltB64}`).digest("hex").slice(0, 24);
  const rel = `embeds/${binHash}.bin`;

  let bytes: Buffer | null = null;
  for (const url of embedFileUrls(repo, rel)) {
    const candidate = await fetchBytes(url);
    if (candidate && candidate.length >= 60 && candidate.length % 60 === 0) {
      bytes = candidate;
      break;
    }
  }
  if (!bytes) return null;

  const aad = Buffer.from(`elchini-kslot-v7:${sid}:${saltB64}`);
  for (const origin of EMBED_ALLOWED_ORIGINS) {
    const originKey = createHash("sha256").update(`elchini-origin-v7:${origin}:${saltB64}`).digest();
    for (let offset = 0; offset < bytes.length; offset += 60) {
      try {
        const iv = bytes.subarray(offset, offset + 12);
        const sealed = bytes.subarray(offset + 12, offset + 60);
        const decipher = createDecipheriv("aes-256-gcm", originKey, iv) as GcmDecipher;
        decipher.setAAD(aad);
        decipher.setAuthTag(sealed.subarray(32));
        const plain = Buffer.concat([decipher.update(sealed.subarray(0, 32)), decipher.final()]);
        if (plain.length === 32) {
          const key = unscrambleHex32(plain);
          if (/^[0-9a-f]{64}$/i.test(key)) return key;
        }
      } catch {
        /* wrong origin or slot; try the next record */
      }
    }
  }
  return null;
}

/** Integrity tag the embed app checks before decrypting a blob. */
function embedIntegrityOk(blob: EmbedBlob, keyHex: string): boolean {
  if (!blob.salt || !blob.hash) return true;
  for (const version of [6, 5, 4]) {
    const expected = createHash("sha256")
      .update(`elchini-embed-integrity-v${version}:${blob.salt}:${keyHex}`)
      .digest("hex");
    if (expected === blob.hash) return true;
  }
  return false;
}

/** `<owner>/<repo>` of the catalog, read from the URL of the embed app. */
function embedRepoFrom(playerUrl: URL): string {
  const host = playerUrl.hostname.toLowerCase();
  if (host.endsWith(".github.io")) {
    const owner = host.split(".")[0];
    const segment = playerUrl.pathname.split("/").filter(Boolean)[0] ?? "";
    const repo = segment && !/\.\w+$/.test(segment) ? segment : `${owner}.github.io`;
    return `${owner}/${repo}`;
  }
  return EMBED_REPO_FALLBACK;
}

/** Entries of the public catalog, by channel id. */
async function embedCatalog(repo: string): Promise<Record<string, EmbedBlob> | null> {
  return cached<Record<string, EmbedBlob> | null>(`canales:embeds:v1:${repo}`, EMBED_TTL, async () => {
    const [owner, name] = repo.split("/");
    if (!owner || !name) return null;

    const urls = [
      `https://${owner.toLowerCase()}.github.io/${name}/token.json?t=${Date.now()}`,
      `https://raw.githubusercontent.com/${owner}/${name}/refs/heads/main/token.json`,
      `https://raw.githubusercontent.com/${owner}/${name}/master/token.json`,
    ];

    for (const url of urls) {
      const text = await fetchText(url);
      if (!text) continue;
      try {
        const parsed = JSON.parse(text) as { embeds?: unknown };
        if (!parsed.embeds || typeof parsed.embeds !== "object") continue;
        return parsed.embeds as Record<string, EmbedBlob>;
      } catch {
        /* try the next mirror */
      }
    }
    return null;
  });
}

/** `kid:key` in hex, the format the embed stores, to the one Shaka expects. */
function clearKeyFromPair(value: string): CanalClearKey | null {
  const [kid, key] = value.split(":").map((part) => part.trim());
  if (!/^[0-9a-f]{32}$/i.test(kid ?? "") || !/^[0-9a-f]{32}$/i.test(key ?? "")) return null;
  return { kid: hexToBase64Url(kid), key: hexToBase64Url(key) };
}

/** Turns one entry of the catalog into a playable source. */
function sourceFromEmbedConfig(config: EmbedConfig): CanalSource | null {
  const base = httpsUrl(String(config.baseUrl ?? "").trim());
  if (!base) return null;

  const list = Array.isArray(config.canales)
    ? (config.canales as EmbedCanal[])
    : config.canal && typeof config.canal === "object"
      ? [config.canal as EmbedCanal]
      : [];

  const canal = list.find(
    (candidate) => candidate && typeof candidate === "object" && typeof candidate.path === "string"
  );
  if (!canal) return null;

  const path = String(canal.path).trim();
  if (!path) return null;

  const url = new URL(path.startsWith("/") ? path : `/${path}`, base);
  const token = String(config.token ?? "").trim();
  if (token) url.searchParams.set("token", token);
  // The app always asks for a small DVR window; the provider expects it.
  url.searchParams.set("dvr_window_length", "60");

  return {
    kind: /\.m3u8$/i.test(url.pathname) ? "hls" : "dash",
    url: url.toString(),
    clearKey: clearKeyFromPair(String(canal.clearkey ?? "")),
  };
}

/** The `?embed_ch=` app of a player document, when it embeds one. */
function embedFrame(playerHtml: string): URL | null {
  for (const match of playerHtml.matchAll(/<iframe[^>]*src=["']([^"']+)["']/gi)) {
    const url = httpsUrl(match[1]);
    if (url && url.searchParams.has("embed_ch")) return url;
  }
  return null;
}

/**
 * Last resort: some posts end in a third party player page and publish no
 * stream of their own. Sealing it would break it (the browser has to load
 * that document), so the page goes out as an iframe channel.
 */
function iframeSource(playerHtml: string): CanalSource | null {
  for (const match of playerHtml.matchAll(/<iframe[^>]*src=["']([^"']+)["']/gi)) {
    const url = httpsUrl(match[1]);
    if (!url) continue;
    // A sealed player is decoded here, never handed to the browser.
    if (url.searchParams.has("cfg") || url.searchParams.has("embed_ch")) continue;
    return { kind: "iframe", url: url.toString(), clearKey: null };
  }
  return null;
}

/** Follows the embed app of a player document down to the sealed stream. */
async function sourceFromEmbed(playerHtml: string): Promise<CanalSource | null> {
  const frame = embedFrame(playerHtml);
  if (!frame) return null;

  const canalId = (frame.searchParams.get("embed_ch") ?? "").trim().toLowerCase();
  if (!canalId) return null;

  const repo = embedRepoFrom(frame);
  const catalog = await embedCatalog(repo);
  if (!catalog) return null;

  const blob = catalog[canalId];
  if (!blob || typeof blob !== "object") return null;

  // v6 blobs no longer carry the key: it is recovered from the protected
  // binary module of the catalog repository.
  let keyed = blob;
  if (!blob.k && blob.salt) {
    const keyHex = await embedKeyFromBin(repo, canalId, blob.salt);
    if (!keyHex || !embedIntegrityOk(blob, keyHex)) return null;
    keyed = { ...blob, k: keyHex };
  }

  const plain = decryptEmbedPayload(keyed);
  if (!plain) return null;

  try {
    return sourceFromEmbedConfig(JSON.parse(plain) as EmbedConfig);
  } catch {
    return null;
  }
}

/** Resolves the playable source of a post. */
async function sourceFromPost(postHtml: string): Promise<CanalSource | null> {
  /** Player documents that hold no direct stream yet; they may embed the app. */
  const players: string[] = [];

  for (const doc of candidateDocuments(postHtml)) {
    const player = decryptAesPayload(doc);
    for (const candidate of [player, doc]) {
      if (!candidate) continue;
      const playlist = extractStreamUrl(candidate);
      if (playlist) return { kind: "hls", url: playlist, clearKey: null };
      const dash = extractDashSource(candidate);
      if (dash) return dash;

      // A player that publishes its manifest without the `manifestUri`
      // wrapper still plays, it just has no ClearKey of its own.
      const manifest = extractDashUrl(candidate);
      if (manifest) return { kind: "dash", url: manifest, clearKey: null };
    }
    if (player) players.push(player);
  }

  // The current posts no longer publish a stream: their player loads a small
  // app that keeps the catalog (base url, token, clear keys) encrypted in a
  // public JSON. Following that chain is the only way to play them.
  for (const player of players) {
    const embedded = await sourceFromEmbed(player);
    if (embedded) return embedded;
  }

  // Channels whose chain ends in a third party player page: nothing to relay.
  for (const player of players) {
    const wrapped = iframeSource(player);
    if (wrapped) return wrapped;
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
  const entry = entries?.find((candidate) => candidate.id === id);
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

/** Marks the tokens of a channel whose media is really CENC encrypted. */
export interface CanalSealOptions {
  encrypted?: boolean;
}

/** A sealed reference: the upstream URL and how its media must be treated. */
export interface CanalToken {
  url: string;
  encrypted: boolean;
}

/** Per-process fallback used only when the environment does not set a key. */
const DEV_RELAY_KEY = "goltv-development-only-relay-key";
let warnedAboutRelayKey = false;

/**
 * Key of the sealed relay tokens.
 *
 * It has to come from the environment: the old public fallback let anybody
 * mint tokens for the allowlisted hosts, so the relay accepted requests the
 * app never created. A deployed build refuses to seal instead of inventing a
 * key; locally a constant keeps tokens usable across restarts.
 */
function tokenKey(): Buffer {
  const secret = process.env.CANALES_PROXY_SECRET?.trim();
  if (secret) return createHash("sha256").update(secret).digest();

  if (process.env.NODE_ENV === "production") {
    throw new Error("CANALES_PROXY_SECRET is not configured");
  }
  if (!warnedAboutRelayKey) {
    warnedAboutRelayKey = true;
    console.warn("[canales] CANALES_PROXY_SECRET missing: using the development relay key");
  }
  return createHash("sha256").update(DEV_RELAY_KEY).digest();
}

/** Encrypts an upstream URL so manifest and segment paths stay anonymous. */
export function sealCanalUrl(url: string, options: CanalSealOptions = {}): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const payload = Buffer.from(
    JSON.stringify({ u: url, e: Date.now() + TOKEN_TTL_MS, k: options.encrypted ? 1 : 0 }),
    "utf8"
  );
  const cipherText = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([iv, cipherText, cipher.getAuthTag()]).toString("base64url");
}

/** Opens a token minted by `sealCanalUrl`; null when tampered or expired. */
export function openCanalToken(token: string): CanalToken | null {
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

    const parsed = JSON.parse(plain) as { u?: unknown; e?: unknown; k?: unknown };
    if (typeof parsed.u !== "string" || typeof parsed.e !== "number") return null;
    if (parsed.e < Date.now()) return null;
    const url = httpsUrl(parsed.u);
    if (!url) return null;
    return { url: url.toString(), encrypted: parsed.k === 1 };
  } catch {
    return null;
  }
}

/** Opens a token and returns only its URL, for the callers that ignore DRM. */
export function openCanalUrl(token: string): string | null {
  return openCanalToken(token)?.url ?? null;
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
export function canalRelayUrl(url: string, options: CanalSealOptions = {}): string {
  return `${RELAY_PATH}?t=${sealCanalUrl(url, options)}`;
}

/** Rewrites every URI of a playlist to a sealed relay URL. */
export function rewriteCanalPlaylist(
  body: string,
  upstream: URL,
  options: CanalSealOptions = {}
): string {
  const seal = (value: string): string => {
    if (/^(data|blob):/i.test(value)) return value;
    try {
      return canalRelayUrl(new URL(value, upstream).toString(), options);
    } catch {
      // Some playlists carry values with stray spaces; they still point to a
      // segment, so they are encoded instead of dropped.
      try {
        return canalRelayUrl(new URL(value.trim().replace(/\s+/g, "%20"), upstream).toString(), options);
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
 * relay.
 *
 * Channels whose segments really are CENC encrypted keep their `cenc`
 * declaration, because the browser needs the key id to decrypt them with the
 * ClearKey of the channel; the Widevine and PlayReady entries are dropped, as
 * their license servers do not exist. Clear channels lose every declaration
 * so the old feed does not ask for a license that never existed.
 */
export function rewriteCanalManifest(
  body: string,
  upstream: URL,
  options: CanalSealOptions = {}
): string {
  const seal = (value: string): string => {
    if (/^(data|blob):/i.test(value)) return value;
    try {
      return canalRelayUrl(new URL(value, upstream).toString(), options);
    } catch {
      return value;
    }
  };

  const sealTemplate = (value: string): string => {
    if (/^(data|blob):/i.test(value)) return value;
    // The template carries XML entities (`&amp;`) that the manifest parser
    // would have decoded; the relay needs the plain separator.
    const plain = value.replace(/&amp;/gi, "&");
    let absolute: string;
    try {
      absolute = new URL(plain, upstream).toString();
    } catch {
      return value;
    }
    const parts = [`t=${sealCanalUrl(absolute, options)}`];
    for (const [placeholder, name] of DASH_PLACEHOLDERS) {
      if (absolute.includes(placeholder)) parts.push(`${name}=${placeholder}`);
    }
    return `${RELAY_PATH}?${parts.join("&")}`;
  };

  const resolved = resolveRepresentationIds(body).replace(
    /<ContentProtection\b([^>]*?)(?:\/>|>[\s\S]*?<\/ContentProtection>)\s*/g,
    (match, attrs: string) => (options.encrypted && /mp4protection/i.test(attrs) ? match : "")
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
