import { createHash } from "node:crypto";
import type { Channel } from "./types";
import { getCache, setCache } from "./cache";
import { matchTeamsPair } from "./team-matching";

// PlayerTwo's API uses protobuf wire messages. This small reader keeps only the
// wire types used by its match and stream endpoints.
type ProtoValue = number | Buffer;
type ProtoFields = Record<number, ProtoValue[]>;

function readVarint(data: Buffer, state: { offset: number }): number {
  let value = 0;
  let shift = 0;
  while (state.offset < data.length && shift <= 49) {
    const byte = data[state.offset++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7;
  }
  throw new Error("Invalid protobuf varint");
}

function parseProto(data: Buffer): ProtoFields {
  const fields: ProtoFields = {};
  const state = { offset: 0 };
  while (state.offset < data.length) {
    const tag = readVarint(data, state);
    const number = Math.floor(tag / 8);
    const wire = tag % 8;
    if (!number) throw new Error("Invalid protobuf field");
    let value: ProtoValue = 0;
    if (wire === 0) value = readVarint(data, state);
    else if (wire === 2) {
      const length = readVarint(data, state);
      if (length > data.length - state.offset) throw new Error("Invalid protobuf length");
      value = data.subarray(state.offset, state.offset + length);
      state.offset += length;
    } else if (wire === 1) state.offset += 8;
    else if (wire === 5) state.offset += 4;
    else throw new Error("Unsupported protobuf wire type");
    if (state.offset > data.length) throw new Error("Truncated protobuf data");
    if (wire === 1 || wire === 5) continue;
    (fields[number] ??= []).push(value);
  }
  return fields;
}

function nested(value: ProtoValue | undefined): ProtoFields {
  return Buffer.isBuffer(value) ? parseProto(value) : {};
}

function firstText(fields: ProtoFields, number: number): string {
  const value = fields[number]?.[0];
  return Buffer.isBuffer(value) ? value.toString("utf8") : "";
}

function apiBase(): string {
  return process.env.PLAYER_TWO_API_BASE?.trim().replace(/\/$/, "") ?? "";
}

function referer(): string {
  return process.env.PLAYER_TWO_REFERER?.trim() ?? "";
}

function reqHeaders(): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    ...(referer() ? { Referer: referer() } : {}),
  };
}

function query(params: Record<string, string | number | boolean | number[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, String(item));
  }
  return search.toString();
}

async function fetchBytes(url: string): Promise<{ data: Buffer; response: Response }> {
  const response = await fetch(url, { headers: reqHeaders(), signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (!response.ok) throw new Error(`PlayerTwo HTTP ${response.status}`);
  return { data: Buffer.from(await response.arrayBuffer()), response };
}

async function signatureCodes(params: Record<string, string | number | boolean | number[]>): Promise<Map<number, string>> {
  const base = apiBase();
  if (!base) return new Map();
  const { data } = await fetchBytes(`${base}/api/common/bs?${query(params)}`);
  const outer = parseProto(data);
  const entries = nested(outer[10]?.[0])[1] ?? [];
  return new Map(entries.map((entry) => {
    const item = parseProto(entry as Buffer);
    const code = item[1]?.[0];
    const token = item[2]?.[0];
    return [typeof code === "number" ? code : 0, Buffer.isBuffer(token) ? token.toString() : ""];
  }));
}

function orderedParams(params: Record<string, string | number | boolean | number[]>): Record<string, string | number | boolean | number[]> {
  const order = ["matchId", "leagueId", "seasonId", "sportType", "language", "stream"];
  return Object.fromEntries(Object.keys(params).sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    return ai - bi;
  }).map((key) => [key, params[key]]));
}

async function signedBytes(
  path: string,
  params: Record<string, string | number | boolean | number[]>,
  token: string
): Promise<Buffer> {
  const ordered = orderedParams(params);
  const sig = createHash("md5").update(JSON.stringify(ordered)).digest("hex").slice(0, 6);
  const { data } = await fetchBytes(`${apiBase()}/sfver${sig}${token}${path}?${query(ordered)}`);
  return data;
}

interface ProviderMatch {
  id: number;
  home: string;
  away: string;
  matchSlug: string;
  leagueSlug: string;
}

function parseMatches(data: Buffer): ProviderMatch[] {
  const root = nested(parseProto(data)[10]?.[0]);
  return (root[1] ?? []).flatMap((item) => {
    try {
      const match = parseProto(item as Buffer);
      const page = nested(match[150]?.[0]);
      const teams = (match[30] ?? []).map((entry) => {
        const outer = parseProto(entry as Buffer);
        const team = nested(outer[10]?.[0]);
        return firstText(nested(team[3]?.[0]), 2);
      }).filter(Boolean);
      const id = match[1]?.[0];
      const matchSlug = firstText(page, 20);
      const leagueSlug = firstText(page, 21);
      if (typeof id !== "number" || teams.length < 2 || !matchSlug || !leagueSlug) return [];
      return [{ id, home: teams[0], away: teams[1], matchSlug, leagueSlug }];
    } catch {
      return [];
    }
  });
}

const MATCH_CACHE = "player-two:football-live:v1";
const MATCH_TTL = 45_000;

async function findProviderMatch(home: string, away: string): Promise<ProviderMatch | null> {
  const base = apiBase();
  if (!base) return null;
  try {
    let matches = await getCache<ProviderMatch[]>(MATCH_CACHE);
    if (!matches) {
      const params = { code: [100], stream: true, sportType: 1 };
      const codes = await signatureCodes(params);
      const token = codes.get(100);
      if (!token) return null;
      const data = await signedBytes("/api/match/live", params, token);
      matches = parseMatches(data);
      await setCache(MATCH_CACHE, matches, MATCH_TTL);
    }
    return matches.find((candidate) => matchTeamsPair(candidate.home, candidate.away, home, away)) ?? null;
  } catch (error) {
    console.warn("[player-two] Football signal lookup failed:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Player-domain resolution
// ---------------------------------------------------------------------------

/**
 * Route prefix of the same-origin player proxy (src/app/p4). The raw provider
 * URL would be blanked by its frame checks; the proxied path survives them.
 */
export const PLAYER4_PREFIX = "/p4";

/** ROT47 decode — the params endpoint returns its JSON body shifted by 47. */
function rot47(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 33 && c <= 126) {
      out += String.fromCharCode(33 + ((c - 33 + 47) % 94));
    } else {
      out += s[i];
    }
  }
  return out;
}

const PLAYER_DOMAIN_CACHE = "player-two:player-domain:v1";
const PLAYER_DOMAIN_TTL = 3_600_000; // 1 hour

/**
 * Resolve the iframe-player domain dynamically from the provider's
 * `/api/common/params` endpoint.  The response is ROT47-encoded JSON
 * containing `common:web:client` → `seth.iframePlayerDomains[]`.
 */
async function discoverPlayerDomain(): Promise<string> {
  const base = apiBase();
  if (!base) return "";
  try {
    const cached = await getCache<string>(PLAYER_DOMAIN_CACHE);
    if (cached) return cached;
    const response = await fetch(`${base}/api/common/params`, {
      headers: reqHeaders(),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!response.ok) return "";
    const buf = Buffer.from(await response.arrayBuffer());
    const decoded = rot47(buf.toString("utf8"));
    const data = JSON.parse(decoded) as Record<string, string>;
    const client = JSON.parse(data["common:web:client"] || "{}");
    // "seth" is the primary player digit; "trd" is the
    // alternate digit.  Try both in order.
    const domains: string[] =
      client?.seth?.iframePlayerDomains ??
      client?.trd?.iframePlayerDomains ??
      [];
    if (domains.length > 0) {
      const resolved = `https://${domains[0]}`;
      await setCache(PLAYER_DOMAIN_CACHE, resolved, PLAYER_DOMAIN_TTL);
      return resolved;
    }
  } catch (error) {
    console.warn("[player-two] Player-domain discovery failed:", error);
  }
  return "";
}

/**
 * Return the base URL of the clean player iframe.
 * Priority: env `PLAYER_TWO_PLAYER_URL` → dynamic discovery → empty (skip).
 * Also used by src/lib/player4-proxy.ts to resolve the proxied upstream.
 */
export async function playerBase(): Promise<string> {
  const envUrl = process.env.PLAYER_TWO_PLAYER_URL?.trim().replace(/\/$/, "");
  if (envUrl) return envUrl;
  return discoverPlayerDomain();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function findPlayerTwoStreams(home: string, away: string): Promise<Channel[]> {
  if (!apiBase() || !home || !away) return [];
  const match = await findProviderMatch(home, away);
  if (!match) return [];

  try {
    const player = new URL(
      `/football/${match.leagueSlug}-${match.id}/${match.matchSlug}.html`,
      referer()
    );
    player.searchParams.set("icg", Buffer.from("AR", "utf8").toString("base64"));
    const base = await playerBase();
    if (!base) {
      console.warn("[player-two] No player domain available");
      return [];
    }
    // mdata = base64(matchId + "_" + sportType).  sportType 1 = football.
    const mdata = Buffer.from(`${match.id}_1`, "utf8").toString("base64");
    // Emit the proxied path: the raw provider URL fails the provider's own
    // embedding checks (judgeValid + frame trap), which /p4 bypasses server-side.
    const url = `${PLAYER4_PREFIX}/es/player.html?mdata=${mdata}&ilang=es`;
    return [{
      id: `player-two-${match.id}`,
      name: "Señal principal",
      provider: "iframe-bridge",
      url,
      kind: "iframe",
    }];
  } catch (error) {
    console.warn("[player-two] Player URL unavailable:", error);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Test-only helpers
// ---------------------------------------------------------------------------

/** @internal — exposed only for unit tests */
export function __parseMatchesForTest(data: Buffer): ProviderMatch[] {
  return parseMatches(data);
}

/** @internal — exposed only for unit tests */
export function __rot47ForTest(s: string): string {
  return rot47(s);
}
