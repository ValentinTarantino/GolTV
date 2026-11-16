import { NextRequest, NextResponse } from "next/server";

const ADMIN_SESSION_COOKIE = "goltv_admin_session";

function isAdminRequest(request: NextRequest): boolean {
  const session = request.cookies.get(ADMIN_SESSION_COOKIE);
  return session?.value === "authenticated";
}

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = request.nextUrl.searchParams.get("ip");
  if (!ip) {
    return NextResponse.json({ error: "IP is required" }, { status: 400 });
  }

  try {
    // Use ip-api.com for geolocation (free, no API key needed for basic usage)
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,isp,org,as,query`);
    const data = await response.json();

    if (data.status === "success") {
      return NextResponse.json({
        ip: data.query,
        country: data.country,
        countryCode: data.countryCode,
        region: data.regionName,
        city: data.city,
        isp: data.isp,
        org: data.org,
        as: data.as,
      });
    } else {
      return NextResponse.json({ error: "Could not get IP info" }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: "Failed to fetch IP info" }, { status: 500 });
  }
}
