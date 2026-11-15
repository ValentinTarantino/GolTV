import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getCache, setCache } from "./cache";

function reveal(value: string): string {
  return Buffer.from(value, "base64").toString("utf8").split("").reverse().join("");
}

const API_BASE = "https://auraplay.win/api";
const API_USER_AGENT = "CorboAppV2";
const API_SECRET = "AuraPlay_Key_2026_Secreta!";
const FLOW_SEED_USER_AGENT = "reyalPuuB";
const CATALOG_PATH = "core_data_COR.php";

/**
 * Issuers that hand out a signed token for a channel path. Each of them
 * answers with a redirect that carries the node that serves that channel.
 */
const FLOW_ISSUERS = [
  reveal("cmEubW9jLnZ0dGF2Yy5uZGM="),
  reveal("cmEubW9jLnZ0dGF2Yy50c2FjZW1vcmhj"),
  reveal("cmEubW9jLnZ0dGF2Yy55cC1uZGM="),
];

/** Headers the upstream player sends for every flow/cvattv request. */
export const FLOW_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  Referer: "https://portal.app.flow.com.ar/",
  Origin: "https://portal.app.flow.com.ar",
  Accept: "*/*",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
};

const CATALOG_TTL = 5 * 60 * 1000;
const STREAM_TTL = 2 * 60 * 1000;
const FLOW_TOKEN_TTL = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 20_000;

/** Category names that carry sports channels in the upstream catalog. */
const SPORTS_CATEGORY = /.*/i;

/**
 * Sports channels for the "Canales" section. The catalog also lists sports
 * channels served by third party CDNs (aiv-cdn, amagi, …); those stay out
 * of this section on purpose.
 */
const SPORTS_ALLOWLIST = [
  "ESPN 1",
  "ESPN 2",
  "ESPN 3",
  "ESPN 4",
  "ESPN PREMIUM",
  "FOX Sports",
  "FOX Sports2",
  "FOX Sports 3",
  "TNT Sports Premium",
  "NBA TV",
  "TyC Sports",
  "TyC Sports Internacional",
  "DeporTV",
  "PX Sports",
  "America Sports",
  "EVENTOS Sports",
  "DSports 🇦🇷",
  "Dsports 2 Op2",
  "Dazn Fast",
  "EVENTOS FORMULA 1",
  "Disney Channel",
];

const pending = new Map<string, Promise<unknown>>();

/** Public shape returned by `/api/canales`: never carries a URL. */
export interface CanalChannel {
  id: string;
  label: string;
  group: "lpf" | "sports";
}

/** ClearKey material of an encrypted channel. */
export interface CanalClearKey {
  kid: string;
  key: string;
}

interface CatalogStream {
  name?: string;
  stream_id?: number | string;
  category_id?: string | number;
  category_name?: string;
  container_extension?: string;
  stream_url?: string;
  drm_license?: string;
}

export interface CatalogEntry extends Omit<CatalogStream, "name"> {
  name: string;
  url: string;
  drm_license?: string;
}

function httpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

/** Credentials come from the environment only, like the other scrapers. */
function credentials(): { user: string; pass: string } | null {
  const user = process.env.AURAPLAY_USER?.trim();
  const pass = process.env.AURAPLAY_PASS?.trim();
  if (!user || !pass) return null;
  return { user, pass };
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

/**
 * Decrypts a catalog payload: `base64( IV(16) ‖ AES-256-CBC(payload) )` with
 * the key derived from the app secret.
 */
export function decryptCatalogPayload(payload: string): string | null {
  try {
    const raw = Buffer.from(payload.trim(), "base64");
    if (raw.length <= 16) return null;
    const key = createHash("sha256").update(API_SECRET, "utf8").digest();
    const iv = raw.subarray(0, 16);
    const cipherText = raw.subarray(16);
    if (cipherText.length % 16 !== 0) return null;
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Builds the encrypted catalog request URL for a command. */
export function buildCatalogUrl(cmd: string, user: string, pass: string, now = Date.now()): string {
  const url = new URL(`${API_BASE}/${CATALOG_PATH}`);
  url.searchParams.set("cmd", cmd);
  url.searchParams.set("usr", user);
  url.searchParams.set("pwd", pass);
  url.searchParams.set("did", "goltv-libre");
  url.searchParams.set("sid", "1");
  url.searchParams.set("t", String(now));
  return url.toString();
}

async function fetchCatalog(cmd: string): Promise<CatalogStream[] | null> {
  const creds = credentials();
  if (!creds) return null;

  try {
    const res = await fetch(buildCatalogUrl(cmd, creds.user, creds.pass), {
      headers: { "User-Agent": API_USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const plain = decryptCatalogPayload(await res.text());
    if (!plain) return null;
    const parsed = JSON.parse(plain) as CatalogStream[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function loadCatalog(): Promise<CatalogEntry[]> {
  return cached("auraplay:catalog:v1", CATALOG_TTL, async () => {
    const streams = await fetchCatalog("s_vivo");
    if (!streams) return [] as CatalogEntry[];

    const entries: CatalogEntry[] = [];
    for (const stream of streams) {
      const url = stream.stream_url ?? "";
      const name = (stream.name ?? "").trim();
      if (!url || !name) continue;
      if (!SPORTS_CATEGORY.test(stream.category_name ?? "")) continue;
      entries.push({ ...stream, name, url });
    }
    return entries;
  });
}

/** Opaque, stable, non-reversible reference for a channel. */
export function channelId(entry: CatalogEntry): string {
  const seed = `${entry.name}|${entry.stream_id ?? ""}|${entry.url}`;
  return "can_" + createHash("sha256").update(seed).digest("hex").slice(0, 16);
}

function groupOf(entry: CatalogEntry): "lpf" | "sports" {
  return /LPF/i.test(entry.category_name ?? "") ? "lpf" : "sports";
}

/**
 * Every channel of the "Canales" section: the LPF Play reproducers published
 * by the catalog plus the requested sports list.
 */
export async function listCanales(): Promise<CanalChannel[]> {
  const entries = await loadCatalog();

  const lpf = entries
    .filter((entry) => groupOf(entry) === "lpf")
    .map((entry) => ({ id: channelId(entry), label: entry.name, group: "lpf" as const }))
    .sort((a, b) => a.label.localeCompare(b.label, "es", { numeric: true }));

  const sports = entries
    .filter((entry) => SPORTS_ALLOWLIST.includes(entry.name))
    .map((entry) => ({ id: channelId(entry), label: entry.name, group: "sports" as const }));

  return [...lpf, ...sports];
}

/* ------------------------------------------------------------------ *
 * Flow CDN: seed token and path translation
 * ------------------------------------------------------------------ */

export interface FlowToken {
  host: string;
  token: string;
}

/**
 * Asks the issuers for a token that is signed for this exact channel path.
 *
 * The token is only valid on the node that issued it, so host and token have
 * to travel together. The pair is cached per path.
 */
export async function loadFlowToken(path: string): Promise<FlowToken | null> {
  return cached(`auraplay:flow-token:v2:${path}`, FLOW_TOKEN_TTL, async () => {
    for (const issuer of FLOW_ISSUERS) {
      try {
        const res = await fetch(`https://${issuer}/${path}`, {
          headers: { "User-Agent": FLOW_SEED_USER_AGENT },
          redirect: "manual",
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          cache: "no-store",
        });
        const location = res.headers.get("location");
        if (!location) continue;
        const match = location.match(/tok_[^/]+/);
        if (!match) continue;
        const host = new URL(location).host;
        if (!host) continue;
        return { host, token: match[0] };
      } catch {
        /* try the next issuer */
      }
    }
    return null;
  });
}

/**
 * The catalog points at the `SA_Live_dash_enc` folder, which the reachable
 * edge refuses for segments. The same signal is published as
 * `SA_Live_dash_cenc`, and that variant answers with real media.
 */
export function toServablePath(path: string): string {
  return path.replace(/SA_Live_dash_enc/g, "SA_Live_dash_cenc");
}

/** Relative path of a channel inside the CDN, without host or token. */
export function relativePath(url: string): string | null {
  const parsed = httpUrl(url);
  if (!parsed) return null;
  return parsed.pathname.replace(/^\/tok_[^/]+/, "").replace(/^\//, "");
}

/**
 * The catalog wraps the CDN path in a query parameter (`?path=…`). The path
 * has to be read from there, the pathname of the wrapper is just the
 * generator endpoint.
 */
export function extractCdnPath(url: string): string | null {
  const parsed = httpUrl(url);
  if (!parsed) return null;
  const wrapped = parsed.searchParams.get("path");
  if (wrapped) return relativePath(wrapped);
  return relativePath(url);
}

/** True when the catalog entry is served by the signed-token CDN. */
export function isFlowStream(url: string): boolean {
  return /cdn-token\.app\.flow\.com\.ar/.test(url) || /cvattv\.com\.ar/.test(url);
}

/**
 * Turns a catalog entry into a playable URL: flow entries get the fresh
 * token and the servable path, plain HLS entries are used as they are.
 */
export async function resolveCanalStream(entry: CatalogEntry): Promise<CanalSource | null> {
  const raw = entry.url;
  const clearKey = parseClearKey(entry.drm_license);

  if (isFlowStream(raw)) {
    const rel = extractCdnPath(raw);
    if (!rel) return null;
    const path = toServablePath(rel);
    const token = await loadFlowToken(path);
    if (!token) return null;
    return {
      url: `https://${token.host}/${token.token}/${path}`,
      kind: path.endsWith(".mpd") ? "dash" : "hls",
      clearKey,
    };
  }

  const parsed = httpUrl(raw);
  if (!parsed) return null;
  return {
    url: parsed.toString(),
    kind: parsed.pathname.endsWith(".m3u8") ? "hls" : "dash",
    clearKey,
  };
}

/** A resolved channel: where to fetch it and how to decrypt it. */
export interface CanalSource {
  url: string;
  kind: "dash" | "hls";
  clearKey: CanalClearKey | null;
}

/** Resolves an opaque channel id to its playable source. */
export async function resolveCanalById(id: string): Promise<CanalSource | null> {
  if (!/^can_[a-f0-9]{16}$/.test(id)) return null;
  const entries = await loadCatalog();
  const entry = entries.find((candidate) => channelId(candidate) === id);
  if (!entry) return null;
  return cached<CanalSource | null>(`auraplay:stream:v3:${id}`, STREAM_TTL, () =>
    resolveCanalStream(entry)
  );
}

/**
 * The catalog ships the ClearKey of every encrypted channel as
 * `kid:<base64url>,k:<base64url>`. The browser needs it to decrypt the CENC
 * segments, exactly like the upstream player does.
 */
export function parseClearKey(value: string | null | undefined): CanalClearKey | null {
  if (!value) return null;
  const parts = String(value).split(",");
  const kid = parts.find((part) => part.startsWith("kid:"))?.slice(4)?.trim();
  const key = parts.find((part) => part.startsWith("k:"))?.slice(2)?.trim();
  if (!kid || !key) return null;
  return { kid, key };
}

/** ClearKey DRM system id (the one Shaka maps to org.w3.clearkey). */
const CLEAR_KEY_SYSTEM_ID = "e2719d58a985b3c9781ab030af78d30e";

/** Builds the ClearKey pssh the manifest needs to declare the key system. */
export function buildClearKeyPssh(kid: string, key: string): string {
  const data = Buffer.from(JSON.stringify({ keyid: kid, key }), "utf8");
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const box = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    Buffer.from(CLEAR_KEY_SYSTEM_ID, "hex"),
    size,
    data,
  ]);
  return box.toString("base64");
}

/**
 * The upstream delivers clear media but with the CENC bookkeeping of the old
 * encrypted feed: the init carries `pssh`/`sinf` boxes and every segment a
 * `senc`/`saiz`/`saio` trio. Browsers read those boxes as "this is DRM" and
 * open a key session for a key that the platform never has, so the boxes are
 * renamed to `free`. The box sizes stay untouched: renaming is enough for
 * the browser to ignore them.
 */
export function neutralizeDrmBoxes(buffer: Buffer): Buffer {
  const copy = Buffer.from(buffer);
  const swaps = [
    "pssh",
    "sinf",
    "senc",
    "saiz",
    "saio",
    "sbgp",
    "sgpd",
    "encv",
    "enca",
  ];
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

/**
 * Removes the DRM declarations of a manifest so the player treats the
 * segments as clear media instead of asking for a license.
 */
export function removeDrmDeclarations(manifest: string): string {
  return manifest.replace(
    /<ContentProtection\b[^>]*?(?:\/>|>[\s\S]*?<\/ContentProtection>)\s*/g,
    ""
  );
}

/* ------------------------------------------------------------------ *
 * Sealed relay tokens
 * ------------------------------------------------------------------ */

const TOKEN_AAD = Buffer.from("goltv-canales-relay");
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
const RELAY_PATH = "/api/canales/stream";

type GcmDecipher = ReturnType<typeof createDecipheriv> & {
  setAuthTag(tag: Buffer): void;
  setAAD(buffer: Buffer): void;
};

function tokenKey(): Buffer {
  const secret = process.env.CANALES_PROXY_SECRET?.trim() || "goltv-canales-relay";
  return createHash("sha256").update(secret).digest();
}

/** Encrypts an upstream URL so manifest and segment paths stay anonymous. */
export function sealCanalUrl(url: string, clearKey?: CanalClearKey | null): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const payload = Buffer.from(
    JSON.stringify({
      u: url,
      e: Date.now() + TOKEN_TTL_MS,
      ...(clearKey ? { k: clearKey.kid, y: clearKey.key } : {}),
    }),
    "utf8"
  );
  const cipherText = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([iv, cipherText, cipher.getAuthTag()]).toString("base64url");
}

/** A sealed reference: the upstream URL plus the key material it needs. */
export interface OpenedCanalToken {
  url: string;
  clearKey: CanalClearKey | null;
}

/** Opens a token minted by `sealCanalUrl`; null when tampered or expired. */
export function openCanalUrl(token: string): string | null {
  return openCanalToken(token)?.url ?? null;
}

/** Opens a token and returns the ClearKey it carries, when it has one. */
export function openCanalToken(token: string): OpenedCanalToken | null {
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

    const parsed = JSON.parse(plain) as { u?: unknown; e?: unknown; k?: unknown; y?: unknown };
    if (typeof parsed.u !== "string" || typeof parsed.e !== "number") return null;
    if (parsed.e < Date.now()) return null;
    const url = httpUrl(parsed.u)?.toString() ?? null;
    if (!url) return null;
    const clearKey =
      typeof parsed.k === "string" && typeof parsed.y === "string"
        ? { kid: parsed.k, key: parsed.y }
        : null;
    return { url, clearKey };
  } catch {
    return null;
  }
}

/** Hosts the relay will fetch. Allow all HTTPS hosts by default. */
export function isCanalStreamHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  
  // Block obviously malicious hosts
  if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
    return false;
  }
  
  // Allow all HTTPS hosts
  if (url.protocol === "https:") {
    return true;
  }
  
  // Allow HTTP only for specific known hosts
  if (url.protocol === "http:") {
    return host === "emitiendoenvivo.com" || host.endsWith(".emitiendoenvivo.com");
  }
  
  return false;
}

/** Client-facing relay URL for an upstream manifest or segment. */
export function canalRelayUrl(url: string, clearKey?: CanalClearKey | null): string {
  return `${RELAY_PATH}?t=${sealCanalUrl(url, clearKey ?? null)}`;
}

/** Rewrites every URI of an HLS playlist to a sealed relay URL. */
export function rewriteCanalPlaylist(body: string, upstream: URL): string {
  const seal = (value: string): string => {
    if (/^(data|blob):/i.test(value)) return value;
    try {
      return canalRelayUrl(new URL(value, upstream).toString());
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

/**
 * The manifests publish their segment names with a `$RepresentationID$`
 * placeholder. The upstream player replaces it with the id of the matching
 * `<Representation>`; without it the segment file simply does not exist and
 * the CDN answers 503.
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
      return `<AdaptationSet${attrs}>${inner.replace(/\$RepresentationID\$/g, id)}</AdaptationSet`;
    }
  );
}

/**
 * DASH placeholders. The player substitutes them inside the URL, so they have
 * to travel next to the sealed token and not inside it.
 */
export function expandDashTemplate(token: { url: string; clearKey: CanalClearKey | null }, params: URLSearchParams): string {
  let url = token.url;
  for (const [name, value] of params) {
    if (name.startsWith("$")) {
      url = url.replace(name, value);
    }
  }
  return url;
}

/** Rewrites a DASH manifest: clears DRM, resolves IDs, rewrites URIs. */
export function rewriteCanalManifest(body: string, upstream: URL): string {
  let manifest = removeDrmDeclarations(body);
  manifest = resolveRepresentationIds(manifest);
  return manifest.replace(/<BaseURL>([^<]+)<\/BaseURL>/g, (match, base: string) => {
    try {
      const sealed = canalRelayUrl(new URL(base, upstream).toString());
      return `<BaseURL>${sealed}</BaseURL>`;
    } catch {
      return match;
    }
  });
}
