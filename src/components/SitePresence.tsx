"use client";

import { useEffect, useRef } from "react";

// Keep in sync with VIEWER_HEARTBEAT_MS in src/lib/viewers.ts
const HEARTBEAT_MS = 5_000;

const VIEWER_ID_KEY = "goltv-viewer-id";

function getViewerId(): string {
  let id = localStorage.getItem(VIEWER_ID_KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VIEWER_ID_KEY, id);
  }
  return id;
}

/**
 * Invisible site-wide presence tracker: heartbeats /api/presence every few
 * seconds so the admin panel can count everyone on the site, whether they
 * are watching a match or just browsing. Shares the viewer id with
 * ViewerBadge so the same person is one visitor everywhere.
 */
export default function SitePresence() {
  const viewerIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let left = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const send = (action?: "join" | "leave") => {
      if (!viewerIdRef.current) return;
      void fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewerId: viewerIdRef.current, action }),
        keepalive: action === "leave",
      }).catch(() => {
        // transient network error — the 45s active window expires us anyway
      });
    };

    const heartbeat = async () => {
      if (cancelled || left) return;
      try {
        if (!viewerIdRef.current) viewerIdRef.current = getViewerId();
        send("join");
      } finally {
        if (!cancelled && !left) timer = setTimeout(heartbeat, HEARTBEAT_MS);
      }
    };

    const sendLeave = () => {
      if (left) return;
      left = true;
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      send("leave");
    };

    const onPageHide = () => sendLeave();

    heartbeat();
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      sendLeave();
    };
  }, []);

  return null;
}
