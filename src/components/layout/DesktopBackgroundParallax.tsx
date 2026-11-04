"use client";

import { useEffect } from "react";

const DESKTOP_MEDIA_QUERY = "(min-width: 1024px) and (prefers-reduced-motion: no-preference)";

/** Moves only the decorative body pattern, never the page content. */
export default function DesktopBackgroundParallax() {
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_MEDIA_QUERY);
    let frame = 0;

    const reset = () => document.body.style.removeProperty("--desktop-background-offset");
    const update = () => {
      frame = 0;
      if (!desktop.matches) {
        reset();
        return;
      }
      // Keep the movement restrained so text and cards remain the focal point.
      document.body.style.setProperty("--desktop-background-offset", `${Math.round(window.scrollY * 0.16)}px`);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    desktop.addEventListener("change", update);
    return () => {
      window.removeEventListener("scroll", onScroll);
      desktop.removeEventListener("change", update);
      if (frame) window.cancelAnimationFrame(frame);
      reset();
    };
  }, []);

  return null;
}
