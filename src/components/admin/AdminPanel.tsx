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

interface AdminPanelProps {
  /** When provided, renders a close button in the header (overlay usage). */
  onClose?: () => void;
  /** Compact floating-card styling instead of the full-page layout. */
  compact?: boolean;
}

export default function AdminPanel({ onClose, compact = false }: AdminPanelProps) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState(getAdminSession());
  const [bannedIPs, setBannedIPs] = useState<string[]>([]);
  const [ipInfoMap, setIpInfoMap] = useState<Record<string, { country?: string; city?: string; region?: string; isp?: string }>>({});
  const [onlineCount, setOnlineCount] = useState<number | null>(null);
  const [liveViewers, setLiveViewers] = useState<LiveViewer[] | null>(null);
  const [matchLabels, setMatchLabels] = useState<Record<string, string>>({});
  const [expandedViewer, setExpandedViewer] = useState<string | null>(null);
  const [viewerGeo, setViewerGeo] = useState<Record<string, { country?: string; city?: string; region?: string; isp?: string }>>({});
  // Wall clock for the "joined / last seen" counters. Reading Date.now() while
  // rendering is impure, so the value comes from state refreshed by a timer.
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    tick();
    const timer = setInterval(tick, 5_000);
    return () => clearInterval(timer);
  }, []);

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
        labels["nba"] = "Chat · Basket";
        labels["tennis"] = "Chat · Tenis";
        labels["combat"] = "Chat · Boxeo";
        labels["motor"] = "Chat · Automovilismo";
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

  const toggleViewer = (viewerId: string, ip?: string | null) => {
    setExpandedViewer((cur) => (cur === viewerId ? null : viewerId));
    // Geo lookup once per IP when the row is opened — same endpoint the
    // banned-IP list uses.
    if (ip && !viewerGeo[ip] && !ipInfoMap[ip]) {
      void fetch(`/api/admin/ip-info?ip=${encodeURIComponent(ip)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && (d.country || d.city)) {
            setViewerGeo((prev) => ({
              ...prev,
              [ip]: { country: d.country, city: d.city, region: d.region, isp: d.isp },
            }));
          }
        })
        .catch(() => {});
    }
  };

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

  const handleBanViewerIP = async (ip: string) => {
    try {
      const res = await fetch("/api/admin/ban-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip }),
      });
      const data = await res.json();
      if (data.ok) {
        setBannedIPs((prev) => (prev.includes(ip) ? prev : [...prev, ip]));
      }
    } catch {
      // Ignore errors
    }
  };

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
      <div className={compact ? "bg-black p-4" : "min-h-screen bg-black p-8"}>
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
    <div className={compact ? "bg-black p-3" : "min-h-screen bg-black p-8"}>
      <div className={compact ? "mx-auto w-full" : "max-w-4xl mx-auto"}>
        <div className="flex justify-between items-center mb-8">
          <h1 className={compact ? "text-lg font-bold text-white" : "text-2xl font-bold text-white"}>Admin Panel</h1>
          <div className="flex items-center gap-2">
            {onClose && (
              <button
                onClick={onClose}
                className="p-2 bg-white/10 text-white font-bold border-2 border-white hover:bg-white/20"
              >
                Cerrar
              </button>
            )}
            <button
              onClick={handleLogout}
              className="p-2 bg-red-600 text-white font-bold border-2 border-white hover:bg-red-700"
            >
              Cerrar sesión
            </button>
          </div>
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
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {viewerGroups.map(([viewerId, g]) => {
                const expanded = expandedViewer === viewerId;
                const geo = g.meta.ip ? viewerGeo[g.meta.ip] ?? ipInfoMap[g.meta.ip] : undefined;
                return (
                  <div key={viewerId} className="border border-white/20">
                    <button
                      type="button"
                      onClick={() => toggleViewer(viewerId, g.meta.ip)}
                      className="w-full flex items-center justify-between gap-3 px-2.5 py-1.5 text-left hover:bg-white/5"
                    >
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
                              nowMs != null &&
                              `  ·  joined ${Math.max(0, Math.round((nowMs - g.meta.firstSeen) / 60000))}m ago`}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] font-bold uppercase text-gray-500">
                        {nowMs == null ? "—" : `${Math.max(0, Math.round((nowMs - g.lastSeen) / 1000))}s`}
                        {" "}{expanded ? "▾" : "▸"}
                      </span>
                    </button>
                    {expanded && (
                      <div className="border-t border-white/10 px-3 py-2 space-y-1.5 text-xs">
                        <div className="grid grid-cols-[90px_1fr] gap-x-3 gap-y-1">
                          <span className="text-gray-500">ID</span>
                          <span className="text-gray-300 font-mono break-all">{viewerId}</span>
                          <span className="text-gray-500">Nick</span>
                          <span className="text-gray-300">{g.nick ?? "—"}</span>
                          <span className="text-gray-500">IP</span>
                          <span className="text-gray-300 font-mono">{g.meta.ip ?? "—"}</span>
                          {geo && (
                            <>
                              <span className="text-gray-500">Ubicación</span>
                              <span className="text-gray-300">
                                {[geo.city, geo.region, geo.country].filter(Boolean).join(", ") || "—"}
                              </span>
                              {geo.isp && (
                                <>
                                  <span className="text-gray-500">ISP</span>
                                  <span className="text-gray-300">{geo.isp}</span>
                                </>
                              )}
                            </>
                          )}
                          <span className="text-gray-500">Dispositivo</span>
                          <span className="text-gray-300">{g.meta.device ?? "—"}</span>
                          <span className="text-gray-500">Navegador</span>
                          <span className="text-gray-300">{[g.meta.browser, g.meta.os].filter(Boolean).join(" · ") || "—"}</span>
                          <span className="text-gray-500">Idioma</span>
                          <span className="text-gray-300">{g.meta.lang ?? "—"}</span>
                          <span className="text-gray-500">País (CF)</span>
                          <span className="text-gray-300">{g.meta.country ?? "—"}</span>
                          <span className="text-gray-500">Vino de</span>
                          <span className="text-gray-300 font-mono break-all">{g.meta.referrer ?? "—"}</span>
                          <span className="text-gray-500">Primera vez</span>
                          <span className="text-gray-300">
                            {g.meta.firstSeen != null && nowMs != null
                              ? `${new Date(g.meta.firstSeen).toLocaleString()} (${Math.max(0, Math.round((nowMs - g.meta.firstSeen) / 60000))}m ago)`
                              : "—"}
                          </span>
                          <span className="text-gray-500">Última vez</span>
                          <span className="text-gray-300">
                            {nowMs != null
                              ? `${new Date(g.lastSeen).toLocaleString()} (hace ${Math.max(0, Math.round((nowMs - g.lastSeen) / 1000))}s)`
                              : "—"}
                          </span>
                        </div>
                        {g.matches.length > 0 && (
                          <div className="pt-1 border-t border-white/10">
                            <span className="text-gray-500">Partidos vistos: </span>
                            <span className="text-gray-300">{g.matches.map(viewerMatchLabel).join("  ·  ")}</span>
                          </div>
                        )}
                        {g.site && (
                          <div className="pt-1 border-t border-white/10 text-gray-400">Navegando el sitio (sin partido abierto)</div>
                        )}
                        <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2">
                          {g.meta.ip &&
                            (bannedIPs.includes(g.meta.ip) ? (
                              <span className="text-[10px] font-bold uppercase text-red-400">IP baneada</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => g.meta.ip && handleBanViewerIP(g.meta.ip)}
                                className="px-2 py-1 text-[10px] font-bold uppercase bg-red-600 text-white border border-white/40 hover:bg-red-700"
                              >
                                Banear IP
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
