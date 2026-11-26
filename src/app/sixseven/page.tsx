"use client";

import { useState, useEffect, useMemo } from "react";
import { getAdminSession, setAdminFlag, clearAdminFlag, logoutAdmin } from "@/lib/admin";

interface LiveViewer {
  matchId: string;
  viewerId: string;
  nick: string | null;
  lastSeen: number;
  firstSeen?: number | null;
  ip?: string | null;
  country?: string | null;
  device?: string | null;
  browser?: string | null;
  os?: string | null;
  lang?: string | null;
  referrer?: string | null;
}

// Presence doc id for "on the site but not on a specific match". Mirrors
// SITE_PRESENCE_ID in src/lib/viewers.ts (kept literal: that module is
// server-only and cannot be imported here).
const SITE_SCOPE = "__site__";

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState(getAdminSession());
  const [bannedIPs, setBannedIPs] = useState<string[]>([]);
  const [ipInfoMap, setIpInfoMap] = useState<Record<string, { country?: string; city?: string; region?: string; isp?: string }>>({});
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [liveViewers, setLiveViewers] = useState<LiveViewer[] | null>(null);
  const [matchLabels, setMatchLabels] = useState<Record<string, string>>({});

  // Poll the site-wide presence counter while the admin panel is open.
  useEffect(() => {
    if (!admin.isAdmin) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch("/api/presence", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.count === "number") setOnlineCount(data.count);
      } catch {
        // transient error — keep the last count
      }
    };

    void poll();
    const timer = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [admin.isAdmin]);

  // Live viewer list: who is on the site and which match each one watches.
  // Match labels come from the public fixture endpoints (cached server-side),
  // refreshed once a minute alongside the viewer poll.
  useEffect(() => {
    if (!admin.isAdmin) return;
    let cancelled = false;

    const loadLabels = async () => {
      const labels: Record<string, string> = {};
      const put = (list: unknown, label: (m: Record<string, unknown>) => string) => {
        if (!Array.isArray(list)) return;
        for (const m of list) {
          const rec = m as Record<string, unknown> & { id?: number | string };
          if (rec.id == null) continue;
          labels[String(rec.id)] = label(rec);
        }
      };
      const pair = (home: unknown, away: unknown, comp: unknown) =>
        `${String(home ?? "")} vs ${String(away ?? "")}${comp ? ` · ${String(comp)}` : ""}`;
      try {
        const [agenda, nba, tennis, combat, lpf, motor] = await Promise.all([
          fetch("/api/matches").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/nba/matches").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/tennis/matches").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/combat/matches").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/lpf/matches").then((r) => (r.ok ? r.json() : null)),
          fetch("/api/motor/matches").then((r) => (r.ok ? r.json() : null)),
        ]);
        put(agenda?.matches, (m) => {
          const ht = m.homeTeam as { name?: string } | undefined;
          const at = m.awayTeam as { name?: string } | undefined;
          const lg = m.league as { name?: string } | undefined;
          return pair(ht?.name, at?.name, lg?.name);
        });
        put(nba?.matches, (m) => pair(m.home, m.away, m.competition));
        put(tennis?.matches, (m) => pair(m.home, m.away, m.competition));
        put(combat?.matches, (m) => {
          const h = m.home as string | undefined;
          const a = m.away as string | undefined;
          return h && a ? pair(h, a, m.sportName) : String(m.title ?? `#${m.id}`);
        });
        put(lpf?.matches, (m) => pair(m.home, m.away, m.competition));
        put(motor?.matches, (m) =>
          `${String(m.title ?? `#${m.id}`)}${m.sportName ? ` · ${String(m.sportName)}` : ""}`
        );
        // Shared per-section chat rooms surface as viewer scopes too.
        labels["nba"] = "Chat · NBA";
        labels["tennis"] = "Chat · Tenis";
        labels["combat"] = "Chat · Lucha";
        labels["motor"] = "Chat · Motor";
      } catch {
        // labels are cosmetic — the raw ids still render
      }
      if (!cancelled) setMatchLabels(labels);
    };

    const pollViewers = async () => {
      try {
        const res = await fetch("/api/admin/viewers", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled && Array.isArray(data.viewers)) setLiveViewers(data.viewers);
        }
      } catch {
        // transient error — keep the last list
      }
    };

    void loadLabels();
    void pollViewers();
    const viewersTimer = setInterval(pollViewers, 15_000);
    const labelsTimer = setInterval(loadLabels, 60_000);
    return () => {
      cancelled = true;
      clearInterval(viewersTimer);
      clearInterval(labelsTimer);
    };
  }, [admin.isAdmin]);

  // One row per person: a viewer produces a site doc plus one doc per match
  // they opened, so group by viewerId before rendering.
  const viewerGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        nick: string | null;
        site: boolean;
        matches: string[];
        lastSeen: number;
        meta: LiveViewer;
      }
    >();
    for (const v of liveViewers ?? []) {
      const g =
        map.get(v.viewerId) ??
        { nick: null, site: false, matches: [], lastSeen: 0, meta: v };
      if (v.nick && !g.nick) g.nick = v.nick;
      if (v.matchId === SITE_SCOPE) g.site = true;
      else if (!g.matches.includes(v.matchId)) g.matches.push(v.matchId);
      g.lastSeen = Math.max(g.lastSeen, v.lastSeen);
      // Meta fields are identical across a viewer's docs; keep whichever doc
      // actually carried them (some docs predate the meta fields).
      for (const k of ["ip", "country", "device", "browser", "os", "lang", "referrer"] as const) {
        if (!g.meta[k] && v[k]) g.meta[k] = v[k];
      }
      if (!g.meta.firstSeen && v.firstSeen) g.meta.firstSeen = v.firstSeen;
      map.set(v.viewerId, g);
    }
    return [...map.entries()].sort((a, b) => b[1].lastSeen - a[1].lastSeen);
  }, [liveViewers]);

  const viewerMatchLabel = (matchId: string) => matchLabels[matchId] ?? `#${matchId}`;

  const viewerMetaChips = (m: LiveViewer): string[] => {
    const chips: string[] = [];
    if (m.country) chips.push(m.country);
    if (m.device) chips.push(m.device);
    const bo = [m.browser, m.os].filter(Boolean).join(" · ");
    if (bo) chips.push(bo);
    if (m.lang) chips.push(m.lang.toUpperCase());
    if (m.ip) chips.push(m.ip);
    if (m.referrer) chips.push(`via ${m.referrer}`);
    return chips;
  };

  const fetchBannedIPs = async () => {
    try {
      const res = await fetch("/api/admin/ban-ip");
      const data = await res.json();
      if (data.bannedIPs) {
        setBannedIPs(data.bannedIPs);
        // Fetch IP info for each banned IP
        for (const ip of data.bannedIPs) {
          try {
            const infoRes = await fetch(`/api/admin/ip-info?ip=${encodeURIComponent(ip)}`);
            const infoData = await infoRes.json();
            if (infoData.country || infoData.city) {
              setIpInfoMap(prev => ({
                ...prev,
                [ip]: {
                  country: infoData.country,
                  city: infoData.city,
                  region: infoData.region,
                  isp: infoData.isp,
                },
              }));
            }
          } catch {
            // Ignore errors
          }
        }
      }
    } catch {
      // Ignore errors
    }
  };

  useEffect(() => {
    // Check if user is already authenticated via cookie
    fetch("/api/admin/session")
      .then(res => res.json())
      .then(data => {
        if (data.isAdmin) {
          setAdminFlag();
          setAdmin(getAdminSession());
          void fetchBannedIPs();
        }
      })
      .catch(() => {});
  }, []);

  const handleUnbanIP = async (ip: string) => {
    try {
      const res = await fetch("/api/admin/ban-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, action: "unban" }),
      });
      const data = await res.json();
      if (data.ok) {
        setBannedIPs(prev => prev.filter(bannedIP => bannedIP !== ip));
      }
    } catch {
      // Ignore errors
    }
  };

  const handleLogin = async () => {
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      const data = await res.json();
      
      if (data.success) {
        setAdminFlag();
        setAdmin(getAdminSession());
        setError("");
        void fetchBannedIPs();
      } else {
        setError(data.error || "Secret incorrecto");
      }
    } catch {
      setError("Error de conexión");
    }
  };

  const handleLogout = () => {
    clearAdminFlag();
    logoutAdmin();
    setAdmin({ isAdmin: false });
  };

  if (!admin.isAdmin) {
    return (
      <div className="min-h-screen bg-black p-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-white mb-4">Admin Login</h1>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Secret"
            className="w-full p-2 border-2 border-white bg-black text-white mb-2"
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          {error && <p className="text-red-500 mb-2">{error}</p>}
          <button
            onClick={handleLogin}
            className="w-full p-2 bg-red-600 text-white font-bold border-2 border-white hover:bg-red-700"
          >
            Iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-white">Admin Panel</h1>
          <button
            onClick={handleLogout}
            className="p-2 bg-red-600 text-white font-bold border-2 border-white hover:bg-red-700"
          >
            Cerrar sesión
          </button>
        </div>

        <div className="p-4 border-2 border-white bg-black mb-6">
          <p className="text-white font-bold mb-4">Panel de administración</p>
          <p className="text-gray-400 text-sm mb-3">Las funciones de moderación están disponibles en el chat.</p>
          <p className="text-white text-sm">
            <span className="font-bold text-accent-primary">{onlineCount ?? "—"}</span>{" "}
            personas en el sitio ahora
          </p>
        </div>

        <div className="p-4 border-2 border-white bg-black mb-6">
          <h2 className="text-white font-bold mb-1">Viewers en vivo</h2>
          <p className="text-gray-500 text-xs mb-3">
            Se actualiza cada 15s. El nick aparece cuando el viewer escribe en el chat.
          </p>
          {liveViewers === null ? (
            <p className="text-gray-400 text-sm">Cargando…</p>
          ) : viewerGroups.length === 0 ? (
            <p className="text-gray-400 text-sm">No hay viewers activos</p>
          ) : (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {viewerGroups.map(([viewerId, g]) => (
                <div key={viewerId} className="flex items-center justify-between gap-3 border border-white/20 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <span className="text-white text-sm font-bold">
                      {g.nick ?? `viewer ${viewerId.slice(0, 8)}`}
                    </span>
                    <div className="text-xs text-gray-400 truncate">
                      {g.matches.length > 0
                        ? g.matches.map(viewerMatchLabel).join("  ·  ")
                        : g.site
                          ? "Navegando el sitio"
                          : "—"}
                    </div>
                    {viewerMetaChips(g.meta).length > 0 && (
                      <div className="text-[10px] text-gray-500 font-mono truncate">
                        {viewerMetaChips(g.meta).join("  ·  ")}
                        {g.meta.firstSeen != null &&
                          `  ·  joined ${Math.max(0, Math.round((Date.now() - g.meta.firstSeen) / 60000))}m ago`}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] font-bold uppercase text-gray-500">
                    {Math.max(0, Math.round((Date.now() - g.lastSeen) / 1000))}s
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 border-2 border-white bg-black">
          <h2 className="text-white font-bold mb-4">IPs Baneadas</h2>
          {bannedIPs.length === 0 ? (
            <p className="text-gray-400 text-sm">No hay IPs baneadas</p>
          ) : (
            <div className="space-y-2">
              {bannedIPs.map(ip => {
                const info = ipInfoMap[ip];
                return (
                  <div key={ip} className="flex items-center justify-between p-2 border border-white/30">
                    <div className="flex-1">
                      <span className="text-white text-sm font-mono">{ip}</span>
                      {info && (
                        <div className="text-xs text-gray-400 mt-1">
                          {info.country && <span>{info.country}</span>}
                          {info.city && <span> - {info.city}</span>}
                          {info.isp && <span className="ml-2">({info.isp})</span>}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleUnbanIP(ip)}
                      className="px-3 py-1 bg-green-600 text-white text-xs font-bold border border-white hover:bg-green-700 ml-4"
                    >
                      Desbanear
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
