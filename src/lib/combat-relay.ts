import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { isBlockedNetworkTarget } from "./url-guard";

/**
 * Sealed references for the combat relay (`/api/combat/stream`).
 *
 * The boxing/MMA embeds hand out playlists whose CDN answers only when the
 * request carries the embed page as `Referer`; a browser can never send that,
 * so the media has to travel through this server. The upstream URL and the
 * referer ride inside an AES-GCM token: the client sees an opaque string, the
 * route refuses anything it did not mint, and the provider host never reaches
 * the page source.
 */

const TOKEN_AAD = Buffer.from("goltv-combat-relay-v1");

/** Signed links outlive a fight but not the session that started it. */
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

/** Per-process fallback used only when the environment does not set a key. */
const DEV_RELAY_KEY = "goltv-development-only-combat-key";
let warnedAboutRelayKey = false;

/**
 * Key of the sealed tokens. It has to come from the environment: a published
 * fallback would let anybody mint tokens for arbitrary hosts. Deployments
 * refuse to seal instead of inventing a key; locally a constant keeps tokens
 * usable across restarts. `CANALES_PROXY_SECRET` is accepted as a fallback so
 * a single secret keeps both relays working.
 */
function tokenKey(): Buffer {
  const secret = (process.env.COMBAT_RELAY_SECRET ?? process.env.CANALES_PROXY_SECRET ?? "").trim();
  if (secret) return createHash("sha256").update(secret).digest();

  if (process.env.NODE_ENV === "production") {
    throw new Error("COMBAT_RELAY_SECRET is not configured");
  }
  if (!warnedAboutRelayKey) {
    warnedAboutRelayKey = true;
    console.warn("[combat] COMBAT_RELAY_SECRET missing: using the development relay key");
  }
  return createHash("sha256").update(DEV_RELAY_KEY).digest();
}

export interface CombatToken {
  url: string;
  referer: string;
}

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

/** Seals an upstream URL together with the referer its CDN demands. */
export function sealCombatUrl(url: string, referer: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const payload = Buffer.from(
    JSON.stringify({ u: url, r: referer, e: Date.now() + TOKEN_TTL_MS }),
    "utf8"
  );
  const cipherText = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([iv, cipherText, cipher.getAuthTag()]).toString("base64url");
}

/** Opens a token minted by `sealCombatUrl`; null when tampered or expired. */
export function openCombatToken(token: string): CombatToken | null {
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

    const parsed = JSON.parse(plain) as { u?: unknown; r?: unknown; e?: unknown };
    if (typeof parsed.u !== "string" || typeof parsed.r !== "string" || typeof parsed.e !== "number") {
      return null;
    }
    if (parsed.e < Date.now()) return null;

    const url = httpsUrl(parsed.u);
    const referer = httpsUrl(parsed.r);
    if (!url || !referer) return null;
    if (isBlockedNetworkTarget(url) || isBlockedNetworkTarget(referer)) return null;

    return { url: url.toString(), referer: referer.origin + "/" };
  } catch {
    return null;
  }
}

const URI_ATTR_RE = /URI="([^"]+)"/g;

/** Client-facing relay URL for an upstream asset. */
export function combatRelayUrl(url: string, referer: string): string {
  return `/api/combat/stream?t=${encodeURIComponent(sealCombatUrl(url, referer))}`;
}

/** Points every playlist reference (and key/map URI) back at the relay. */
export function rewriteCombatPlaylist(body: string, upstream: URL, referer: string): string {
  const seal = (value: string): string => {
    if (/^(data|blob):/i.test(value)) return value;
    try {
      return combatRelayUrl(new URL(value, upstream).toString(), referer);
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
        return line.replace(URI_ATTR_RE, (_match, uri: string) => `URI="${seal(uri)}"`);
      }
      return seal(trimmed);
    })
    .join("\n");
}
