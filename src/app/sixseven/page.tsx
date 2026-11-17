"use client";

import { useState, useEffect } from "react";
import { getAdminSession, setAdminFlag, clearAdminFlag, logoutAdmin } from "@/lib/admin";

export default function AdminPage() {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [admin, setAdmin] = useState(getAdminSession());
  const [bannedIPs, setBannedIPs] = useState<string[]>([]);
  const [ipInfoMap, setIpInfoMap] = useState<Record<string, { country?: string; city?: string; region?: string; isp?: string }>>({});
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

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
