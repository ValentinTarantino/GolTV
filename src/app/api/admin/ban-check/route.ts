import { NextRequest, NextResponse } from "next/server";
import { isIPBanned } from "@/lib/chat";

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  const cfIP = request.headers.get("cf-connecting-ip");
  if (cfIP) return cfIP;
  return "unknown";
}

export async function GET(request: NextRequest) {
  const clientIP = getClientIP(request);
  try {
    const banned = await Promise.race([
      isIPBanned(clientIP),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
    ]);
    return NextResponse.json(
      { banned },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=60",
        },
      }
    );
  } catch {
    return NextResponse.json(
      { banned: false },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=60",
        },
      }
    );
  }
}
