"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { isValidTimeZone } from "@/lib/time-zones";

interface TimeZoneContextValue {
  timeZone: string;
  setTimeZone: (timeZone: string) => void;
}

const TimeZoneContext = createContext<TimeZoneContextValue | undefined>(undefined);
const STORAGE_KEY = "goltv-time-zone";
const DEFAULT_TIME_ZONE = "America/Argentina/Buenos_Aires";
const CHANGE_EVENT = "goltv-time-zone-change";
let inMemoryTimeZone: string | null = null;

function getSnapshot(): string {
  if (inMemoryTimeZone) return inMemoryTimeZone;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isValidTimeZone(saved)) return saved;
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(detected) ? detected : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function getServerSnapshot(): string {
  return DEFAULT_TIME_ZONE;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function TimeZoneProvider({ children }: { children: React.ReactNode }) {
  const timeZone = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTimeZone = (nextTimeZone: string) => {
    if (!isValidTimeZone(nextTimeZone)) return;
    inMemoryTimeZone = nextTimeZone;
    try {
      localStorage.setItem(STORAGE_KEY, nextTimeZone);
    } catch {
      // The selection still applies for the current session.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return (
    <TimeZoneContext.Provider value={{ timeZone, setTimeZone }}>
      {children}
    </TimeZoneContext.Provider>
  );
}

export function useTimeZone() {
  const context = useContext(TimeZoneContext);
  if (!context) throw new Error("useTimeZone must be used within a TimeZoneProvider");
  return context;
}