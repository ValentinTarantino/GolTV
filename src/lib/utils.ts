import { LIVE_STATUSES, FINISHED_STATUSES, UPCOMING_STATUSES } from "./constants";
import type { MatchStatusShort } from "./types";
import type { Language } from "@/i18n/dictionaries";

export function isLive(status: MatchStatusShort): boolean {
  return LIVE_STATUSES.includes(status);
}

export function isFinished(status: MatchStatusShort): boolean {
  return FINISHED_STATUSES.includes(status);
}

export function isUpcoming(status: MatchStatusShort): boolean {
  return UPCOMING_STATUSES.includes(status);
}

export function isViewable(status: MatchStatusShort, timestamp: number): boolean {
  if (isLive(status)) return true;
  if (!isUpcoming(status)) return false;
  return Date.now() / 1000 >= timestamp - 30 * 60;
}

export function formatTime(dateStr: string, lang: Language = "es"): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(lang === "es" ? "es-AR" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: lang === "en",
  });
}

export function formatDate(dateStr: string, lang: Language = "es"): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(lang === "es" ? "es-AR" : "en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getCountdown(timestamp: number, lang: Language = "es"): string {
  const now = Date.now() / 1000;
  const diff = timestamp - now;
  if (diff <= 0) return lang === "es" ? "Comenzando..." : "Starting...";

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = Math.floor(diff % 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function getStatusLabel(status: MatchStatusShort, elapsed: number | null, lang: Language = "es"): string {
  if (isLive(status)) {
    if (status === "HT") return lang === "es" ? "ET" : "HT";
    if (status === "1H" || status === "2H") return elapsed ? `${elapsed}'` : lang === "es" ? "EN VIVO" : "LIVE";
    if (status === "ET") return elapsed ? `${elapsed}' (ET)` : lang === "es" ? "Extra" : "AET";
    return lang === "es" ? "EN VIVO" : "LIVE";
  }
  if (isFinished(status)) return lang === "es" ? "Final" : "FT";
  if (status === "SUSP") return lang === "es" ? "Susp." : "Suspended";
  if (status === "PST") return lang === "es" ? "Posterg." : "Postponed";
  if (status === "CANC") return lang === "es" ? "Canc." : "Cancelled";
  return "";
}

export function getDayLabel(date: Date, lang: Language = "es"): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (lang === "en") {
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays === -1) return "Yesterday";
    return date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
  }

  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  if (diffDays === -1) return "Ayer";
  return date.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" });
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
