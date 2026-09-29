"use client";

import { useEffect, useRef, useState } from "react";
import { Eye } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// Keep in sync with VIEWER_HEARTBEAT_MS in src/lib/viewers.ts
// (duplicated here so the client bundle never pulls in the mongodb driver)
const HEARTBEAT_MS = 15_000;

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

interface ViewerBadgeProps {
  matchId: string;
  /** Only track while true (e.g. the match is viewable/live). */
  active?: boolean;
}

export default function ViewerBadge({ matchId, active = true }: ViewerBadgeProps) {
  const { t } = useLanguage();
  const [count, setCount] = useState<number | null>(null);
  const viewerIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const heartbeat = async () => {
      if (cancelled) return;
      try {
        if (!viewerIdRef.current) viewerIdRef.current = getViewerId();
        const res = await fetch("/api/viewers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, viewerId: viewerIdRef.current }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.count === "number") setCount(data.count);
      } catch {
        // transient network error — keep the last known count
      } finally {
        if (!cancelled) timer = setTimeout(heartbeat, HEARTBEAT_MS);
      }
    };

    heartbeat();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [matchId, active]);

  if (!active || count === null) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black uppercase tracking-wider bg-black text-white border-2 border-white shadow-badge w-fit"
      id="viewer-badge"
      title={t.watch.viewers}
    >
      <Eye size={13} strokeWidth={3} />
      <span data-testid="viewer-count">{count}</span>
      <span className="hidden sm:inline">{t.watch.viewers}</span>
    </span>
  );
}
