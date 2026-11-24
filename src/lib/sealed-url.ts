import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

const TOKEN_AAD = Buffer.from("goltv-lpf-relay");
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * `createDecipheriv` only exposes `setAuthTag` on the GCM overload; with a
 * runtime-built `aes-<bits>-gcm` string TypeScript falls back to the generic
 * `Decipher` type, so widen it locally.
 */
type GcmDecipher = ReturnType<typeof createDecipheriv> & {
  setAuthTag(tag: Buffer): void;
  setAAD(buffer: Buffer): void;
};

/** Per-process fallback used only when the environment does not set a key. */
const DEV_RELAY_KEY = "goltv-development-only-lpf-key";
let warnedAboutRelayKey = false;

/**
 * Key of the sealed relay tokens. A missing secret is a hard error in a
 * deployed build: the old public fallback let anyone forge relay tokens.
 */
function tokenKey(): Buffer {
  const secret = process.env.LPF_PROXY_SECRET?.trim();
  if (secret) return createHash("sha256").update(secret).digest();

  if (process.env.NODE_ENV === "production") {
    throw new Error("LPF_PROXY_SECRET is not configured");
  }
  if (!warnedAboutRelayKey) {
    warnedAboutRelayKey = true;
    console.warn("[lpf] LPF_PROXY_SECRET missing: using the development relay key");
  }
  return createHash("sha256").update(DEV_RELAY_KEY).digest();
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

/**
 * Segment tokens must be identical for every viewer of the same match so a
 * CDN edge can deduplicate the media requests. The IV is derived from the
 * URL plus a coarse time bucket, and the expiry is bucket-aligned, so the
 * same upstream URL seals to the same token for the whole bucket window.
 * GCM nonce reuse is safe here because a given IV only ever encrypts one
 * fixed plaintext (same URL, same bucket expiry).
 */
const SEGMENT_BUCKET_MS = 15 * 60 * 1000;

export function sealLpfSegmentUrl(url: string): string {
  const bucket = Math.floor(Date.now() / SEGMENT_BUCKET_MS);
  const bucketStart = bucket * SEGMENT_BUCKET_MS;
  const iv = createHmac("sha256", tokenKey())
    .update(`goltv-seg:${bucket}`)
    .update(url)
    .digest()
    .subarray(0, 12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  cipher.setAAD(TOKEN_AAD);
  const payload = Buffer.from(
    JSON.stringify({
      u: url,
      e: bucketStart + SEGMENT_BUCKET_MS + TOKEN_TTL_MS,
    }),
    "utf8"
  );
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

export function httpsUrl(value: string, base?: string): URL | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}
