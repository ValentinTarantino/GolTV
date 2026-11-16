import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SESSION_COOKIE = "goltv_admin_session";
const SESSION_DURATION = 24 * 60 * 60; // 24 hours in seconds

export async function POST(request: NextRequest) {
  try {
    if (!ADMIN_SECRET) {
      return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
    }

    const { secret } = await request.json();
    
    if (secret !== ADMIN_SECRET) {
      return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    }

    // Set a secure session cookie
    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, "authenticated", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: SESSION_DURATION,
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
