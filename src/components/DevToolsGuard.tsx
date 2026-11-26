"use client";

import { useEffect, useState } from "react";

const POLL_MS = 1_500;
// Docked DevTools shrink the viewport; ~160px covers the default pane widths.
const SIZE_THRESHOLD_PX = 160;
// With DevTools closed the `debugger` statement is a no-op; open, it pauses.
const DEBUGGER_THRESHOLD_MS = 120;

function devtoolsLooksOpen(): boolean {
  if (
    window.outerWidth - window.innerWidth > SIZE_THRESHOLD_PX ||
    window.outerHeight - window.innerHeight > SIZE_THRESHOLD_PX
  ) {
    return true;
  }
  const start = performance.now();
  // new Function keeps the `debugger` statement alive through minification —
  // a literal `debugger;` gets stripped from production bundles. If a CSP
  // ever blocks eval, detection falls back to the size heuristic alone.
  try {
    new Function("debugger")();
  } catch {
    // eval blocked
  }
  return performance.now() - start > DEBUGGER_THRESHOLD_MS;
}

/**
 * Wipes what the curious visitor can see in their own DevTools.
 * Only touches that browser tab: console output and resource timings.
 * The Network panel itself is browser-owned and cannot be cleared from JS.
 */
function scrubDevToolsTraces() {
  try {
    console.clear();
    performance.clearResourceTimings?.();
    for (const level of ["log", "info", "warn", "error", "debug"] as const) {
      console[level] = () => {};
    }
  } catch {
    // best effort only
  }
}

/**
 * Blanks regular visitors who open DevTools: swallows F12 and the classic
 * DevTools shortcuts, scrubs console/resource traces, covers the page, then
 * navigates the tab to about:blank so the Network panel empties too.
 * Admins (valid /api/admin/session) are exempt.
 * This is deterrence, not a security boundary — the markup is still served.
 */
export default function DevToolsGuard() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let isAdmin = false;

    // Swallow the usual DevTools shortcuts for regular visitors. Admins keep
    // them — the flag flips once /api/admin/session resolves.
    const onKeyDown = (e: KeyboardEvent) => {
      if (isAdmin) return;
      const key = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const isDevToolsShortcut =
        e.key === "F12" ||
        (mod && e.shiftKey && (key === "i" || key === "j" || key === "c")) ||
        (mod && key === "u");
      if (isDevToolsShortcut) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);

    const check = () => {
      if (devtoolsLooksOpen()) {
        scrubDevToolsTraces();
        setBlocked(true);
        if (timer) clearInterval(timer);
        window.removeEventListener("resize", check);
        // Navigate the tab itself to about:blank — a fresh document means
        // the Network panel empties and there is no DOM left to inspect.
        // Going Back reloads the site, re-triggers detection, and blanks
        // again while DevTools stays open.
        try {
          window.location.replace("about:blank");
        } catch {
          // overlay above still covers the page
        }
      }
    };

    fetch("/api/admin/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { isAdmin?: boolean }) => {
        isAdmin = data.isAdmin === true;
        if (cancelled || isAdmin) return;
        timer = setInterval(check, POLL_MS);
        // Docking/undocking DevTools fires resize — check immediately.
        window.addEventListener("resize", check);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener("resize", check);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);

  // While the page is blanked, keep wiping anything the browser logs natively.
  useEffect(() => {
    if (!blocked) return;
    const wipe = setInterval(() => console.clear(), 2_000);
    return () => clearInterval(wipe);
  }, [blocked]);

  if (!blocked) return null;
  return <div className="fixed inset-0 z-[2147483647] bg-white" aria-hidden="true" />;
}
