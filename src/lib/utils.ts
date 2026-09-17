import { LIVE_STATUSES, FINISHED_STATUSES, UPCOMING_STATUSES } from "./constants";
import type { MatchStatusShort } from "./types";

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
  return Date.now() / 1000 >= timestamp;
}

export function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-AR", {
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

export function getCountdown(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = timestamp - now;
  if (diff <= 0) return "Comenzando...";

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = Math.floor(diff % 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function getStatusLabel(status: MatchStatusShort, elapsed: number | null): string {
  if (isLive(status)) {
    if (status === "HT") return "ET";
    if (status === "1H" || status === "2H") return elapsed ? `${elapsed}'` : "EN VIVO";
    if (status === "ET") return elapsed ? `${elapsed}' (ET)` : "Extra";
    return "EN VIVO";
  }
  if (isFinished(status)) return "Final";
  if (status === "SUSP") return "Susp.";
  if (status === "PST") return "Posterg.";
  if (status === "CANC") return "Canc.";
  return "";
}

export function getDayLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  if (diffDays === -1) return "Ayer";

  return date.toLocaleDateString("es-AR", { weekday: "short", day: "numeric" });
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
