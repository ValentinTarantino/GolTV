import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-session";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    return NextResponse.json({ isAdmin: isValidAdminSession(session) });
  } catch {
    return NextResponse.json({ isAdmin: false });
  }
}
