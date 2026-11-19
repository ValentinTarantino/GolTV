import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Admin sessions.
 *
 * The cookie used to hold the literal string `authenticated`, so anybody who
 * set that cookie by hand was an admin: it deleted chat messages and banned
 * IPs without ever knowing the secret. Now the cookie is a signed payload
 * (`<expiresAt>.<hmac>`), minted with `ADMIN_SECRET` and checked in constant
 * time. Forging it requires the secret, not a lucky guess.
 *
 * Server only: never import this from a client component.
 */

export const ADMIN_SESSION_COOKIE = "goltv_admin_session";

/** Cookie lifetime. The signed value carries its own expiry too. */
export const ADMIN_SESSION_TTL_SECONDS = 24 * 60 * 60;

function sessionKey(): Buffer | null {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) return null;
  return createHash("sha256").update(secret, "utf8").digest();
}

function sign(payload: string, key: Buffer): string {
  return createHmac("sha256", key).update(payload, "utf8").digest("base64url");
}

/** Constant-time comparison that also hides the length mismatch. */
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Mints the session value, or null when `ADMIN_SECRET` is missing. */
export function createAdminSessionValue(): string | null {
  const key = sessionKey();
  if (!key) return null;
  const payload = String(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000);
  return `${payload}.${sign(payload, key)}`;
}

/** True only for a value minted by this server and still unexpired. */
export function isValidAdminSession(value: string | undefined | null): boolean {
  const key = sessionKey();
  if (!key || !value) return false;

  const separator = value.lastIndexOf(".");
  if (separator <= 0) return false;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!signature || !safeEqual(signature, sign(payload, key))) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

/** Route guard for every admin endpoint. */
export function isAdminRequest(request: NextRequest): boolean {
  return isValidAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}
