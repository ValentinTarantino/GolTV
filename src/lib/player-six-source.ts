import { createHash } from "node:crypto";
import { getCache, setCache } from "./cache";
import { toHlsProxyUrl } from "./hls-proxy";
import type { Channel } from "./types";

const API = process.env.PLAYER_SIX_API_URL || "";
const REFERER = process.env.PLAYER_SIX_REFERER || "";
const SPORT_TYPE = 1; // football
const BASKETBALL_SPORT_TYPE = 2; // basketball
const TENNIS_SPORT_TYPE = 3; // tennis/padel
const FIGHTING_SPORT_TYPE = 14; // fighting events
const DIGIT = process.env.PLAYER_SIX_DIGIT || "";

// The feed embeds crest URLs on a logo CDN whose domain rotates and dies;
// the live host is the one published in the site's own page config. Any
// `/aelogo/` URL on a stale host is rewritten to it. The env var overrides
// the built-in default when the provider rotates the domain again.
const LOGO_CDN = process.env.PLAYER_SIX_LOGO_CDN || "logos1.tcpwe138stya.ru";
function providerLogoUrl(raw: string): string {
  if (!raw || !LOGO_CDN || !raw.includes("/aelogo/")) return raw;
  try {
    const u = new URL(raw);
    if (u.hostname === LOGO_CDN) return raw;
    u.hostname = LOGO_CDN;
    u.protocol = "https:";
    return u.toString();
  } catch {
    return raw;
  }
}
const PARAM_ORDER = ["matchId", "leagueId", "seasonId", "sportType", "language", "stream"];

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function headers(): Record<string, string> {
  return {
    "User-Agent": UA,
    Referer: REFERER,
    Origin: REFERER.replace(/\/$/, ""),
    Accept: "application/json, text/plain, */*",
  };
}

// ---------- protobuf wire helpers ----------

function readVarint(buf: Buffer, i: number): [number, number] {
  let r = 0;
  let s = 0;
  for (;;) {
    const x = buf[i++];
    r += (x & 0x7f) * 2 ** s;
    if (!(x & 0x80)) break;
    s += 7;
    if (s > 35) break;
  }
  return [r, i];
}

type PBField = { f: number; v?: number; d?: Buffer };

function pbFields(buf: Buffer): PBField[] {
  const out: PBField[] = [];
  let i = 0;
  while (i < buf.length) {
    const [key, j] = readVarint(buf, i);
    i = j;
    const f = Math.floor(key / 8);
    const wt = key % 8;
    if (wt === 0) {
      const [v, k] = readVarint(buf, i);
      i = k;
      out.push({ f, v });
    } else if (wt === 2) {
      const [l, k] = readVarint(buf, i);
      i = k;
      out.push({ f, d: buf.subarray(i, i + l) });
      i += l;
    } else if (wt === 5) {
      i += 4;
    } else if (wt === 1) {
      i += 8;
    } else {
      break;
    }
  }
  return out;
}

/** PBResponse wrapper: data lives in field 10. */
function pbData(buf: Buffer): Buffer {
  for (const e of pbFields(buf)) {
    if (e.f === 10 && e.d) return e.d;
  }
  return buf;
}

function pbVarint(msg: Buffer, field: number): number | null {
  for (const e of pbFields(msg)) {
    if (e.f === field && e.v !== undefined) return e.v;
  }
  return null;
}

function pbSubMsgs(msg: Buffer, field: number): Buffer[] {
  return pbFields(msg)
    .filter((e) => e.f === field && e.d)
    .map((e) => e.d as Buffer);
}

function pbStrings(msg: Buffer, minLen = 3): string[] {
  const out: string[] = [];
  const walk = (buf: Buffer, depth: number) => {
    if (depth > 6) return;
    for (const e of pbFields(buf)) {
      if (!e.d) continue;
      const s = e.d.toString("utf8");
      if (e.d.length >= minLen && e.d.length < 300 && /^[\x20-\x7e]+$/.test(s)) {
        out.push(s);
      } else if (e.d.length < 20000) {
        walk(e.d, depth + 1);
      }
    }
  };
  walk(msg, 0);
  return out;
}

// ---------- signing ----------

function sortParams(p: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  Object.keys(p)
    .sort((a, b) => PARAM_ORDER.indexOf(a) - PARAM_ORDER.indexOf(b))
    .forEach((k) => {
      o[k] = p[k];
    });
  return o;
}

function qs(p: Record<string, unknown>): string {
  return Object.entries(p)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
}

function signHash(p: Record<string, unknown>): string {
  return createHash("md5").update(JSON.stringify(p)).digest("hex").slice(0, 6);
}

function parseBsKv(buf: Buffer): Map<number, string> {
  const kv = new Map<number, string>();
  for (let i = 0; i <= buf.length - 36; i++) {
    if (buf[i] !== 0x08) continue;
    let code = 0;
    let sh = 0;
    let j = i + 1;
    while (j < buf.length) {
      const b = buf[j++];
      code |= (b & 0x7f) << sh;
      if (!(b & 0x80)) break;
      sh += 7;
      if (sh > 28) break;
    }
    if (buf[j] === 0x12 && buf[j + 1] === 0x20) {
      kv.set(code, buf.subarray(j + 2, j + 34).toString("latin1"));
    }
  }
  return kv;
}

async function getBsTokens(codes: number[], extra: Record<string, unknown> = {}, sportType = SPORT_TYPE): Promise<Map<number, string>> {
  const cacheKey = `feed-bs-${codes.join(",")}-${sportType}-${JSON.stringify(extra)}`;
  const cached = await getCache<Map<number, string>>(cacheKey);
  if (cached) {
    const m = new Map<number, string>(Object.entries(cached).map(([k, v]) => [Number(k), v as string]));
    return m;
  }
  // bs accepts repeated `code=` params plus the same context params as the call
  const extraQ = Object.entries(extra)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  const q =
    codes.map((c) => `code=${c}`).join("&") +
    "&stream=true&sportType=" +
    sportType +
    (extraQ ? "&" + extraQ : "");
  const r = await fetch(`${API}/api/common/bs?${q}`, { headers: headers() });
  if (!r.ok) throw new Error(`feed bs ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const kv = parseBsKv(buf);
  await setCache(cacheKey, Object.fromEntries(kv), 60_000);
  return kv;
}

async function signedGet(endpoint: string, code: number, params: Record<string, unknown>, bsExtra: Record<string, unknown> = {}, sportType = SPORT_TYPE): Promise<Buffer> {
  const kv = await getBsTokens([code], bsExtra, sportType);
  const token = kv.get(code);
  if (!token) throw new Error(`feed bs token missing for ${code}`);
  const p = sortParams(params);
  const prefix = `/sfver${signHash(p)}${token}`;
  const url = `${API}${prefix}/api/${endpoint}?${qs(p)}`;
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) throw new Error(`feed ${endpoint} ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// ---------- rot47 ----------

function rot47(s: string): string {
  return s.replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)));
}

// ---------- match list ----------

type FeedMatch = {
  matchId: number;
  dateMs: number;
  text: string; // all strings joined, for fuzzy team matching
};

async function getMatchList(): Promise<FeedMatch[]> {
  const cacheKey = "feed-matches-live";
  const cached = await getCache<FeedMatch[]>(cacheKey);
  if (cached) return cached;
  const buf = await signedGet("match/live", 100, { sportType: SPORT_TYPE, stream: true });
  const data = pbData(buf);
  const matches: FeedMatch[] = [];
  for (const m of pbSubMsgs(data, 1)) {
    const matchId = pbVarint(m, 1);
    if (!matchId) continue;
    const dateMs = pbVarint(m, 3) ?? 0;
    const text = pbStrings(m).join(" ").toLowerCase();
    matches.push({ matchId, dateMs, text });
  }
  await setCache(cacheKey, matches, 30_000);
  return matches;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameInText(team: string, text: string): boolean {
  const n = norm(team);
  if (!n) return false;
  // try full name and significant tokens
  if (text.includes(n)) return true;
  const tokens = n.split(" ").filter((t) => t.length >= 4);
  return tokens.length > 0 && tokens.every((t) => text.includes(t));
}

async function findFeedMatchId(home: string, away: string): Promise<number | null> {
  const list = await getMatchList();
  const hn = norm(home);
  const an = norm(away);
  for (const m of list) {
    const hasHome = nameInText(home, m.text) || m.text.includes(hn);
    const hasAway = nameInText(away, m.text) || m.text.includes(an);
    if (hasHome && hasAway) return m.matchId;
  }
  return null;
}

// ---------- streams ----------

type FeedStream = { streamId: number; name: string; siteType: number };

async function getMatchStreams(matchId: number, sportType = SPORT_TYPE): Promise<FeedStream[]> {
  const cacheKey = `feed-streams-${sportType}-${matchId}`;
  const cached = await getCache<FeedStream[]>(cacheKey);
  if (cached) return cached;
  const buf = await signedGet("match/detail", 102, { matchId, sportType, stream: true }, { matchId }, sportType);
  const data = pbData(buf);
  const streams: FeedStream[] = [];
  for (const s of pbSubMsgs(data, 2)) {
    const streamId = pbVarint(s, 1);
    if (!streamId) continue;
    // siteType is field 9 (e.g. 2001); field 8 is an internal channel class
    const siteType = pbVarint(s, 9) ?? pbVarint(s, 8) ?? 1;
    const nameField = pbFields(s).find((e) => e.f === 3 && e.d);
    const name = nameField?.d ? nameField.d.toString("utf8") : `Stream ${streams.length + 1}`;
    streams.push({ streamId, name, siteType });
  }
  await setCache(cacheKey, streams, 60_000);
  return streams;
}

async function resolveStreamUrl(stream: FeedStream, matchId: number, sportType = SPORT_TYPE): Promise<string | null> {
  const params: Record<string, unknown> = {
    streamId: stream.streamId,
    siteType: stream.siteType,
    usls: "rbp",
    continent: "SA",
    country: "AR",
    digit: DIGIT,
    matchId,
    sportType,
  };
  const url = `${API}/api/stream/detail?${qs(params)}`;
  const r = await fetch(url, { headers: headers() });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  const data = pbData(buf);
  // PBStreamResp carries the playlist URL ROT47-obfuscated inside a string
  // field, wrapped in marker bytes before `https://` and after `.m3u8`.
  const candidates: string[] = [];
  const walk = (b: Buffer, depth: number) => {
    if (depth > 5) return;
    for (const e of pbFields(b)) {
      if (!e.d) continue;
      const raw = e.d.toString("latin1");
      if (e.d.length >= 4 && e.d.length < 2000 && /^[\x20-\x7e]+$/.test(raw)) {
        candidates.push(raw);
      } else if (e.d.length < 20000) {
        walk(e.d, depth + 1);
      }
    }
  };
  walk(data, 0);
  for (const c of candidates) {
    const dec = rot47(c);
    const m = dec.match(/https?:\/\/[^\s"']+?\.m3u8/i);
    if (m) return m[0];
  }
  return null;
}

// ---------- fighting events ----------

export interface FightingEvent {
  matchId: number;
  title: string;
  matchDate: number; // epoch ms
}

function pbFieldString(msg: Buffer, field: number): string | null {
  for (const e of pbFields(msg)) {
    if (e.f === field && e.d) {
      const s = e.d.toString("utf8");
      if (/^[\x20-\x7e]+$/.test(s)) return s;
    }
  }
  return null;
}

export async function listFightingEvents(): Promise<FightingEvent[]> {
  if (!API || !REFERER) return [];
  const cacheKey = "feed-fighting-live";
  const cached = await getCache<FightingEvent[]>(cacheKey);
  if (cached) return cached;
  const buf = await signedGet(
    "match/live",
    100,
    { sportType: FIGHTING_SPORT_TYPE, stream: true },
    {},
    FIGHTING_SPORT_TYPE
  );
  const data = pbData(buf);
  const events: FightingEvent[] = [];
  for (const m of pbSubMsgs(data, 1)) {
    const matchId = pbVarint(m, 1);
    if (!matchId) continue;
    const matchDate = pbVarint(m, 3) ?? 0;
    const titleWrap = pbSubMsgs(m, 30)[0];
    const title = (titleWrap && pbFieldString(titleWrap, 2)) || "";
    if (!title) continue;
    events.push({ matchId, title, matchDate });
  }
  events.sort((a, b) => a.matchDate - b.matchDate);
  await setCache(cacheKey, events, 30_000);
  return events;
}

// ---------- basketball matches ----------

export interface BasketballMatch {
  matchId: number;
  league: string;
  leagueLogo: string;
  country: string;
  home: string;
  away: string;
  homeLogo: string;
  awayLogo: string;
  kickoffMs: number;
}

interface BasketballTeam {
  name: string;
  logo: string;
}

/** f30 entries carry either the "Home vs Away" title (f2) or a team block.
 *  Basketball wraps teams in f10, tennis/padel in f20. */
function parseSportTeams(
  matchMsg: Buffer,
  wrapField: number
): { title: string; teams: BasketballTeam[] } {
  let title = "";
  const teams: BasketballTeam[] = [];
  for (const entry of pbSubMsgs(matchMsg, 30)) {
    const direct = pbFieldString(entry, 2);
    if (direct && direct.includes(" vs ")) {
      title = direct;
      continue;
    }
    const wrap = pbSubMsgs(entry, wrapField)[0];
    if (!wrap) continue;
    const nameMsg = pbFields(wrap).find((e) => e.f === 3 && e.d);
    const name = nameMsg?.d ? pbFieldString(nameMsg.d, 2) : null;
    if (!name) continue;
    teams.push({ name, logo: pbFieldString(wrap, 4) ?? "" });
  }
  return { title, teams };
}

async function listSportMatches(
  sportType: number,
  fallbackLeague: string,
  cacheTag: string,
  wrapField = 10
): Promise<BasketballMatch[]> {
  if (!API || !REFERER) return [];
  const cacheKey = `feed-${cacheTag}-live`;
  const cached = await getCache<BasketballMatch[]>(cacheKey);
  if (cached) return cached;
  const buf = await signedGet(
    "match/live",
    100,
    { sportType, stream: true },
    {},
    sportType
  );
  const data = pbData(buf);
  const matches: BasketballMatch[] = [];
  for (const m of pbSubMsgs(data, 1)) {
    const matchId = pbVarint(m, 1);
    if (!matchId) continue;

    const leagueMsg = pbSubMsgs(m, 10)[0];
    const leagueNameMsg = leagueMsg ? pbSubMsgs(leagueMsg, 3)[0] : undefined;
    const countryMsg = leagueMsg ? pbSubMsgs(leagueMsg, 80)[0] : undefined;
    const countryNameMsg = countryMsg ? pbSubMsgs(countryMsg, 3)[0] : undefined;

    const { title, teams } = parseSportTeams(m, wrapField);
    // Team blocks arrive home-first; the title is the fallback disambiguator.
    let home = teams[0];
    let away = teams[1];
    if (title) {
      const [tHome, tAway] = title.split(/\s+vs\s+/i);
      const find = (n?: string) =>
        n ? teams.find((tm) => tm.name.toLowerCase() === n.trim().toLowerCase()) : undefined;
      home = find(tHome) ?? home;
      away = find(tAway) ?? away;
    }
    if (!home || !away) continue;

    matches.push({
      matchId,
      league: (leagueNameMsg && pbFieldString(leagueNameMsg, 2)) || fallbackLeague,
      leagueLogo: providerLogoUrl((leagueMsg && pbFieldString(leagueMsg, 4)) || ""),
      country: (countryNameMsg && pbFieldString(countryNameMsg, 2)) || "",
      home: home.name,
      away: away.name,
      homeLogo: providerLogoUrl(home.logo),
      awayLogo: providerLogoUrl(away.logo),
      kickoffMs: pbVarint(m, 3) ?? 0,
    });
  }
  matches.sort((a, b) => a.kickoffMs - b.kickoffMs);
  await setCache(cacheKey, matches, 30_000);
  return matches;
}

export function listBasketballMatches(): Promise<BasketballMatch[]> {
  return listSportMatches(BASKETBALL_SPORT_TYPE, "Basketball", "basketball");
}

export function listTennisMatches(): Promise<BasketballMatch[]> {
  return listSportMatches(TENNIS_SPORT_TYPE, "Tennis", "tennis", 20);
}

export async function findTennisStreams(matchId: number): Promise<Channel[]> {
  if (!API || !REFERER || !DIGIT) return [];
  try {
    return await channelsForMatch(matchId, TENNIS_SPORT_TYPE);
  } catch (e) {
    console.error("[feed] findTennisStreams failed:", e);
    return [];
  }
}

export async function findBasketballStreams(matchId: number): Promise<Channel[]> {
  if (!API || !REFERER || !DIGIT) return [];
  try {
    return await channelsForMatch(matchId, BASKETBALL_SPORT_TYPE);
  } catch (e) {
    console.error("[feed] findBasketballStreams failed:", e);
    return [];
  }
}

// ---------- public API ----------

async function channelsForMatch(matchId: number, sportType: number): Promise<Channel[]> {
  const streams = await getMatchStreams(matchId, sportType);
  if (!streams.length) return [];
  const channels: Channel[] = [];
  for (const s of streams.slice(0, 4)) {
    try {
      const url = await resolveStreamUrl(s, matchId, sportType);
      if (!url) continue;
      const isHls = /\.m3u8/i.test(url) || url.includes("m3u8");
      channels.push({
        id: `feed-${sportType}-${matchId}-${s.streamId}`,
        name: s.name || `Stream ${channels.length + 1}`,
        url: isHls ? toHlsProxyUrl(url) : url,
        kind: isHls ? "hls" : "iframe",
        provider: "primary-feed",
        streamId: s.streamId,
        siteType: s.siteType,
      });
    } catch {
    }
  }
  return channels;
}

export async function findPlayerSixStreams(homeTeam: string, awayTeam: string): Promise<Channel[]> {
  if (!API || !REFERER || !DIGIT) return [];
  try {
    const matchId = await findFeedMatchId(homeTeam, awayTeam);
    if (!matchId) return [];
    return await channelsForMatch(matchId, SPORT_TYPE);
  } catch (e) {
    console.error("[feed] findPlayerSixStreams failed:", e);
    return [];
  }
}

export async function findFightingStreams(matchId: number): Promise<Channel[]> {
  if (!API || !REFERER || !DIGIT) return [];
  try {
    return await channelsForMatch(matchId, FIGHTING_SPORT_TYPE);
  } catch (e) {
    console.error("[feed] findFightingStreams failed:", e);
    return [];
  }
}
