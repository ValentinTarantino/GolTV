"use client";

import { useEffect } from "react";
import {
  isValidViewerId,
  VIEWER_ID_COOKIE,
  VIEWER_ID_STORAGE_KEY,
} from "@/lib/viewer-id";

const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365;

function newViewerId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Establishes the anonymous viewer identity once per browser: a random id in
 * localStorage mirrored into the `gt_vid` cookie. From then on every request
 * the site already makes carries the id, and server routes register presence
 * from that ambient traffic — no heartbeat endpoint needed.
 */
export default function ViewerIdentity() {
  useEffect(() => {
    let id = localStorage.getItem(VIEWER_ID_STORAGE_KEY);
    if (!isValidViewerId(id)) {
      id = newViewerId();
      localStorage.setItem(VIEWER_ID_STORAGE_KEY, id);
    }

    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${VIEWER_ID_COOKIE}=${id}; Path=/; Max-Age=${COOKIE_MAX_AGE_S}; SameSite=Lax${secure}`;
  }, []);

  return null;
}
