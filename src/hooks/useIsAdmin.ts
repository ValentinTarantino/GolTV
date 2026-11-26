"use client";

import { useEffect, useState } from "react";

/**
 * True once /api/admin/session confirms an admin session; false for regular
 * visitors. Used to gate admin-only UI (viewer counters, badges).
 */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/session", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { isAdmin?: boolean }) => {
        if (!cancelled && data.isAdmin === true) setIsAdmin(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return isAdmin;
}
