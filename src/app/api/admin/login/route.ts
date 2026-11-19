import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { incrementCounter } from "@/lib/cache";
import { getClientIP } from "@/lib/client-ip";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSessionValue,
  safeEqual,
} from "@/lib/admin-session";

/** Attempts allowed per address inside the window, to slow down guessing. */
const MAX_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const adminSecret = process.env.ADMIN_SECRET?.trim();
    if (!adminSecret) {
      return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    }

    const clientIP = getClientIP(request.headers);
    const attempts = await incrementCounter(`admin-login:${clientIP}`, ATTEMPT_WINDOW_MS);
    if (attempts > MAX_ATTEMPTS) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    const payload = (await request.json()) as { secret?: unknown };
    const secret = typeof payload.secret === "string" ? payload.secret : "";

    // Constant time: a plain `!==` leaks how much of the secret was right.
    if (!secret || !safeEqual(secret, adminSecret)) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    const value = createAdminSessionValue();
    if (!value) {
      return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    }

    const cookieStore = await cookies();
    cookieStore.set(ADMIN_SESSION_COOKIE, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: ADMIN_SESSION_TTL_SECONDS,
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
