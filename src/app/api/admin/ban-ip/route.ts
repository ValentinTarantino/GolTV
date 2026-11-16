import { NextRequest, NextResponse } from "next/server";
import { banIP, unbanIP, getBannedIPList } from "@/lib/chat";

const ADMIN_SESSION_COOKIE = "goltv_admin_session";

function isAdminRequest(request: NextRequest): boolean {
  const session = request.cookies.get(ADMIN_SESSION_COOKIE);
  return session?.value === "authenticated";
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bannedIPs = await getBannedIPList();
  return NextResponse.json({ bannedIPs });
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ip, action } = await request.json();

    if (!ip || typeof ip !== "string") {
      return NextResponse.json({ error: "IP is required" }, { status: 400 });
    }

    if (action === "unban") {
      await unbanIP(ip);
      return NextResponse.json({ ok: true, action: "unban" });
    }

    await banIP(ip);
    return NextResponse.json({ ok: true, action: "ban" });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
