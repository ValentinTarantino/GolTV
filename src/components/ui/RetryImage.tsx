"use client";

import Image, { type ImageProps } from "next/image";
import { useState, type ReactNode } from "react";

const MAX_RETRIES = 2;

/**
 * `next/image` wrapper that retries failed badge loads.
 *
 * `/api/img` can return 502 while an upstream CDN hiccups; without a retry
 * the <img> stays broken until the next full page load. Each retry appends a
 * cache-busting param so the browser actually re-requests the URL (the param
 * is ignored by the proxy — the sealed token still authorizes the fetch).
 * `fallback` renders once every retry is exhausted.
 */
export default function RetryImage({ fallback, ...props }: ImageProps & { fallback?: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  const src =
    attempt > 0 && typeof props.src === "string"
      ? `${props.src}${props.src.includes("?") ? "&" : "?"}retry=${attempt}`
      : props.src;

  if (failed) return <>{fallback ?? null}</>;

  return (
    <Image
      {...props}
      alt={props.alt ?? ""}
      src={src}
      onError={(event) => {
        if (attempt < MAX_RETRIES) {
          setAttempt((a) => a + 1);
        } else {
          setFailed(true);
        }
        props.onError?.(event);
      }}
    />
  );
}
