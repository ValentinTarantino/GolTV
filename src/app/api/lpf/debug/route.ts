export const dynamic = "force-dynamic";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
  Referer: "https://es.sportplus.watch/football/",
};

export async function GET(): Promise<Response> {
  const listRes = await fetch("https://goltv.vercel.app/api/lpf/matches", { cache: "no-store" });
  const { matches } = await listRes.json();
  const live = matches.find((m: { status: string }) => m.status === "live") ?? matches[0];

  // The opaque id encodes the tournament + match id as lpm_<hash>, so we
  // can not reverse it: probe the known live match id directly.
  const url = "https://es.sportplus.watch/football/220557/8400999/";
  let status = 0;
  let length = 0;
  let hasLs = false;
  let extracted: string | null = null;
  let preview = "";
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    status = res.status;
    const text = await res.text();
    length = text.length;
    hasLs = text.includes('"ls"');
    const index = text.indexOf('"ls"');
    const fragment = index >= 0 ? text.slice(index, index + 200) : "";
    for (const block of text.matchAll(/"ls":\[([^\]]*)\]/g)) {
      for (const m of block[1].matchAll(/https?:\\u002F\\u002F[^"]+/g)) {
        const clean = m[0].replace(/\\u002F/g, "/");
        if (clean.startsWith("https://") && /\.m3u8(\?|$)/i.test(clean)) {
          extracted = clean;
          break;
        }
      }
      if (extracted) break;
    }
    preview = (extracted ?? fragment ?? text.slice(0, 160)).replace(/\s+/g, " ");
  } catch (error) {
    preview = String(error).slice(0, 120);
  }

  return Response.json(
    {
      matches: matches.length,
      live: live ? { home: live.home, away: live.away, status: live.status } : null,
      sportplus: { url, status, length, hasLs, extracted, preview },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
