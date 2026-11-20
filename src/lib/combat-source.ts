import vm from "node:vm";
import { getCache, setCache } from "./cache";

/**
 * Combat-sports source: futbolvivo.tv publishes its agenda through an
 * encrypted JSON API (`cdn.strm-api.org`). The decryption lives inside an
 * obfuscated loader script embedded in the homepage, exposed as `__lx(i)`.
 * We evaluate that exact script in a `node:vm` sandbox with browser stubs —
 * the same thing the browser does — so the provider's own code decrypts the
 * payload for us. No crypto is reimplemented here.
 */

const SITE_URL = "https://futbolvivo.tv/";
const PAGE_CACHE = "combat:page-script:v1";
const DATA_CACHE = "combat:gsc-matches:v1";
const PAGE_TTL = 10 * 60_000;
const DATA_TTL = 60_000;
const FETCH_TIMEOUT = 15_000;

export interface CombatStream {
  id: number;
  language?: string;
  hd?: boolean;
  embed_url?: string;
  web_url?: string;
  real_url?: string;
  name?: string;
}

export interface CombatMatch {
  id: number;
  title: string;
  sport: string;
  sportName: string;
  startsAt: string;
  timestamp: number;
  live: boolean;
  finished: boolean;
  home?: string;
  away?: string;
  streams: CombatStream[];
}

interface RawMatch {
  id?: number;
  title?: string;
  sport?: string;
  sport_name?: string;
  starts_at?: string;
  timestamp?: number;
  live?: boolean;
  finished?: boolean;
  home?: { name?: string } | null;
  away?: { name?: string } | null;
  streams?: CombatStream[];
}

/** Extracts every inline <script> body from the provider homepage. */
function extractScripts(html: string): string[] {
  const scripts: string[] = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[1] && m[1].trim().length > 50) scripts.push(m[1]);
  }
  return scripts;
}

function browserStubs(): Record<string, unknown> {
  const el = () => ({
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
  });
  return {
    document: {
      // Return element stubs instead of null: the provider's loader writes
      // status messages into #seLoader from a timer, and a null here crashes
      // the Node process with an uncaught exception.
      getElementById: () => el(),
      querySelector: () => el(),
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: el,
      documentElement: { appendChild() {} },
      body: { appendChild() {} },
    },
    navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36" },
    location: { href: SITE_URL },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    TextDecoder,
    TextEncoder,
    atob,
    btoa,
    fetch,
    crypto,
  };
}

/**
 * Loads (and caches) the provider's obfuscated loader and returns a callable
 * `__lx(index)` that yields decrypted JSON. Returns null when the page or the
 * loader cannot be evaluated.
 */
async function loadLoader(): Promise<((index: number) => Promise<unknown>) | null> {
  const cached = await getCache<string>(PAGE_CACHE);
  let scripts: string[] | null = null;
  if (cached) {
    try {
      scripts = JSON.parse(cached) as string[];
    } catch {
      scripts = null;
    }
  }
  if (!scripts) {
    try {
      const res = await fetch(SITE_URL, {
        headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
        cache: "no-store",
      });
      if (!res.ok) return null;
      scripts = extractScripts(await res.text());
      await setCache(PAGE_CACHE, JSON.stringify(scripts), PAGE_TTL);
    } catch {
      return null;
    }
  }
  if (!scripts.length) return null;

  const sandbox = browserStubs() as Record<string, unknown>;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.addEventListener = () => {};
  try {
    vm.createContext(sandbox);
    vm.runInContext(scripts.join("\n;\n"), sandbox, { timeout: 15_000 });
  } catch {
    // Some scripts throw on missing DOM APIs but still define __lx — check below.
  }
  const lx = sandbox.__lx;
  if (typeof lx !== "function") return null;
  return (index: number) => Promise.resolve(lx.call(sandbox, index));
}

export function toCombatMatch(raw: RawMatch): CombatMatch | null {
  if (typeof raw.id !== "number" || !raw.title) return null;
  if (raw.sport !== "boxing" && raw.sport !== "mma") return null;
  return {
    id: raw.id,
    title: raw.title,
    sport: raw.sport,
    sportName: raw.sport_name ?? (raw.sport === "mma" ? "MMA" : "Boxing"),
    startsAt: raw.starts_at ?? "",
    timestamp: raw.timestamp ?? 0,
    live: Boolean(raw.live),
    finished: Boolean(raw.finished),
    home: raw.home?.name ?? undefined,
    away: raw.away?.name ?? undefined,
    streams: Array.isArray(raw.streams) ? raw.streams : [],
  };
}

/**
 * All boxing/MMA events from the provider's global sports feed. `__lx(0)` is
 * the `gsc/matches` endpoint (the same one the site uses for its USA section);
 * indices 4-7 alias it.
 */
export async function listCombatMatches(): Promise<CombatMatch[]> {
  const cached = await getCache<CombatMatch[]>(DATA_CACHE);
  if (cached) return cached;
  try {
    const lx = await loadLoader();
    if (!lx) return [];
    const data = (await lx(0)) as { matches?: RawMatch[] } | null;
    const matches = (data?.matches ?? [])
      .map(toCombatMatch)
      .filter((m): m is CombatMatch => m !== null)
      // Live first, then upcoming by start time.
      .sort((a, b) => Number(b.live) - Number(a.live) || a.timestamp - b.timestamp);
    await setCache(DATA_CACHE, matches, DATA_TTL);
    return matches;
  } catch (error) {
    console.warn("[combat] match list failed:", error);
    return [];
  }
}

export async function findCombatMatch(id: number): Promise<CombatMatch | null> {
  const matches = await listCombatMatches();
  return matches.find((m) => m.id === id) ?? null;
}
