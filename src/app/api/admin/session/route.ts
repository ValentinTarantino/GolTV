import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const SESSION_COOKIE = "goltv_admin_session";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get(SESSION_COOKIE);
    
    if (!session || session.value !== "authenticated") {
      return NextResponse.json({ isAdmin: false });
    }

    return NextResponse.json({ isAdmin: true });
  } catch {
    return NextResponse.json({ isAdmin: false });
  }
}
