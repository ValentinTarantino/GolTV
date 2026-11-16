import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const SESSION_COOKIE = "goltv_admin_session";

export async function POST() {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
