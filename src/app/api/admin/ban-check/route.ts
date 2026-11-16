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
  const banned = await isIPBanned(clientIP);
  return NextResponse.json({ banned });
}
