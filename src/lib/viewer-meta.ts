/**
 * Per-request viewer metadata captured from headers the edge already sends
 * (Cloudflare adds cf-ipcountry / cf-connecting-ip; browsers send UA,
 * Accept-Language and Referer). Stored on the viewer's presence doc, which
 * expires after ~60s, and only ever read by the admin panel.
 */

export interface ViewerMeta {
  ip?: string;
  country?: string;
  device?: "mobile" | "tablet" | "desktop";
  browser?: string;
  os?: string;
  lang?: string;
  referrer?: string;
}

const CF_UNKNOWN_COUNTRIES = new Set(["XX", "T1"]);

function header(request: Request, name: string): string | null {
  const v = request.headers.get(name);
  return v && v.trim() ? v.trim() : null;
}

function clientIp(request: Request): string | undefined {
  // Behind Cloudflare the real client IP arrives in cf-connecting-ip; the
  // x-forwarded-for fallback covers non-Cloudflare proxies.
  const cf = header(request, "cf-connecting-ip");
  if (cf) return cf;
  const fwd = header(request, "x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return header(request, "x-real-ip") ?? undefined;
}

function country(request: Request): string | undefined {
  const cc = header(request, "cf-ipcountry");
  if (!cc || cc.length !== 2 || CF_UNKNOWN_COUNTRIES.has(cc)) return undefined;
  return cc.toUpperCase();
}

function lang(request: Request): string | undefined {
  const al = header(request, "accept-language");
  if (!al) return undefined;
  const primary = al.split(",")[0].split(";")[0].trim();
  return primary ? primary.split("-")[0].toLowerCase() : undefined;
}

function referrer(request: Request): string | undefined {
  const ref = header(request, "referer");
  if (!ref) return undefined;
  try {
    const u = new URL(ref);
    const s = `${u.host}${u.pathname}`.slice(0, 100);
    return s;
  } catch {
    return ref.slice(0, 100);
  }
}

function parseUA(ua: string): Pick<ViewerMeta, "device" | "browser" | "os"> {
  let device: ViewerMeta["device"] = "desktop";
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    device = "tablet";
  } else if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) {
    device = "mobile";
  }

  let os = "Other";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "Other";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua)) browser = "Safari";

  return { device, browser, os };
}

/** Snapshot of who is calling, for the admin viewer list. Cheap: header reads only. */
export function extractViewerMeta(request: Request): ViewerMeta {
  const ua = header(request, "user-agent");
  const meta: ViewerMeta = {
    ip: clientIp(request),
    country: country(request),
    lang: lang(request),
    referrer: referrer(request),
    ...(ua ? parseUA(ua) : {}),
  };
  // Drop undefined keys so Mongo $set only writes what we actually know.
  for (const k of Object.keys(meta) as (keyof ViewerMeta)[]) {
    if (meta[k] === undefined) delete meta[k];
  }
  return meta;
}
