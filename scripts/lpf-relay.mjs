#!/usr/bin/env node
/**
 * LPF home relay — residential-IP egress for the sportplus provider.
 *
 * The provider only serves stream playlists to residential IPs and only
 * answers its API to requests that look like they come from its own site.
 * This script runs on the owner's machine (residential IP), exposes a tiny
 * HTTP relay through a Cloudflare quick tunnel, and registers the tunnel
 * URL with the app so the Vercel deployment can reach it.
 *
 * Usage:
 *   1. Install cloudflared:  winget install cloudflare.cloudflared
 *      (or https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
 *   2. Set in .env.local:    LPF_HOME_SECRET=<random>  GOLTV_BASE_URL=https://goltv.vercel.app
 *   3. Run:                  node scripts/lpf-relay.js
 *
 * Endpoints (all require ?key=<LPF_HOME_SECRET>):
 *   GET /health
 *   GET /view?id=<matchId>&tid=<tournamentId>   → provider match JSON (with `ls`)
 *   GET /fetch?u=<url>                          → proxied bytes of an allowlisted stream URL
 */

import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/* Env                                                                 */
/* ------------------------------------------------------------------ */

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const PORT = Number(process.env.LPF_RELAY_PORT || 8790);
const SECRET = process.env.LPF_HOME_SECRET || "";
const GOLTV_BASE = (process.env.GOLTV_BASE_URL || "https://goltv.vercel.app").replace(/\/$/, "");
const SPORTPLUS_API = process.env.SPORTPLUS_API || "https://apisplus.live/v3.1";
const SPORTPLUS_SITE = process.env.SPORTPLUS_SITE || "https://es.sportplus.watch";
const ALLOWED_HOSTS = (process.env.LPF_STREAM_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

if (!SECRET) {
  console.error("[lpf-relay] LPF_HOME_SECRET is not set — add it to .env.local");
  process.exit(1);
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  Accept: "*/*",
  Referer: `${SPORTPLUS_SITE}/football/`,
};

function hostAllowed(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

/* ------------------------------------------------------------------ */
/* HTTP server                                                         */
/* ------------------------------------------------------------------ */

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body);
}

async function handleView(reqUrl, res) {
  const params = new URL(reqUrl, "http://localhost").searchParams;
  const id = params.get("id");
  const tid = params.get("tid");
  if (!id || !tid) return send(res, 400, JSON.stringify({ error: "id and tid required" }));

  const url =
    `${SPORTPLUS_API}/matches/view?id=${encodeURIComponent(id)}` +
    `&sport_id=football&tournament_id=${encodeURIComponent(tid)}&lang=es&lcfg=es&fw=3.1`;
  try {
    const upstream = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    const text = await upstream.text();
    send(res, upstream.status, text, {
      "content-type": upstream.headers.get("content-type") || "application/json",
    });
  } catch (error) {
    send(res, 502, JSON.stringify({ error: String(error).slice(0, 120) }));
  }
}

async function handleFetch(reqUrl, req, res) {
  const params = new URL(reqUrl, "http://localhost").searchParams;
  const raw = params.get("u");
  if (!raw) return send(res, 400, JSON.stringify({ error: "u required" }));

  let target;
  try {
    target = new URL(raw);
  } catch {
    return send(res, 400, JSON.stringify({ error: "bad url" }));
  }
  if (target.protocol !== "https:" || !hostAllowed(target.hostname)) {
    return send(res, 403, JSON.stringify({ error: "host not allowed", host: target.hostname }));
  }

  try {
    const headers = { "User-Agent": BROWSER_HEADERS["User-Agent"], Accept: "*/*" };
    const range = req.headers.range;
    if (range) headers.Range = range;

    const upstream = await fetch(target, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
      cache: "no-store",
    });

    const outHeaders = {};
    for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) outHeaders[name] = value;
    }
    res.writeHead(upstream.status, outHeaders);
    const body = Buffer.from(await upstream.arrayBuffer());
    res.end(body);
  } catch (error) {
    send(res, 502, JSON.stringify({ error: String(error).slice(0, 120) }));
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.searchParams.get("key") !== SECRET) {
    return send(res, 401, JSON.stringify({ error: "unauthorized" }));
  }
  if (url.pathname === "/health") return send(res, 200, JSON.stringify({ ok: true }));
  if (url.pathname === "/view") return void handleView(req.url, res);
  if (url.pathname === "/fetch") return void handleFetch(req.url, req, res);
  send(res, 404, JSON.stringify({ error: "not found" }));
});

/* ------------------------------------------------------------------ */
/* Tunnel + registration                                               */
/* ------------------------------------------------------------------ */

let registeredUrl = null;

async function register(tunnelUrl) {
  try {
    const res = await fetch(`${GOLTV_BASE}/api/lpf/home-relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: tunnelUrl, secret: SECRET }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      if (registeredUrl !== tunnelUrl) {
        registeredUrl = tunnelUrl;
        console.log(`[lpf-relay] registered ${tunnelUrl} with ${GOLTV_BASE}`);
      }
      return true;
    }
    console.warn(`[lpf-relay] register failed: HTTP ${res.status}`);
  } catch (error) {
    console.warn(`[lpf-relay] register error: ${String(error).slice(0, 100)}`);
  }
  return false;
}

// cloudflared may be missing from the PATH of an already-open terminal, so
// fall back to the well-known install locations.
const BIN_CANDIDATES = [
  "cloudflared",
  "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
  "C:\\Program Files\\cloudflared\\cloudflared.exe",
  "/usr/local/bin/cloudflared",
  "/opt/homebrew/bin/cloudflared",
  "/usr/bin/cloudflared",
];
let binIndex = 0;

function startTunnel() {
  const bin = BIN_CANDIDATES[binIndex];
  console.log(`[lpf-relay] starting cloudflared tunnel (${bin})...`);
  const tunnel = spawn(bin, ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let spawnFailed = false;

  tunnel.on("error", (error) => {
    spawnFailed = true;
    if (error.code === "ENOENT" && binIndex < BIN_CANDIDATES.length - 1) {
      binIndex += 1;
      startTunnel();
      return;
    }
    console.error(
      "[lpf-relay] could not start cloudflared:",
      error.code === "ENOENT"
        ? "not installed — run: winget install cloudflare.cloudflared"
        : String(error)
    );
    console.error("[lpf-relay] the local server keeps running, but Vercel cannot reach it without the tunnel.");
  });

  const onData = (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text);
    const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (match) {
      const url = match[0];
      console.log(`[lpf-relay] tunnel up: ${url}`);
      // Keep registering until the app accepts it (covers redeploys).
      const tryRegister = async () => {
        const ok = await register(url);
        if (!ok) setTimeout(tryRegister, 30_000);
      };
      void tryRegister();
    }
  };
  tunnel.stdout.on("data", onData);
  tunnel.stderr.on("data", onData);

  tunnel.on("exit", (code) => {
    if (spawnFailed) return;
    console.warn(`[lpf-relay] cloudflared exited (${code}), restarting in 5s...`);
    registeredUrl = null;
    setTimeout(startTunnel, 5_000);
  });
}

/* ------------------------------------------------------------------ */

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[lpf-relay] listening on http://127.0.0.1:${PORT}`);
  startTunnel();
});
