"use client";

import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { getDayLabel, formatDateISO } from "@/lib/utils";

interface DateNavigatorProps {
  currentDate: Date;
  onDateChange: (date: Date) => void;
}

export default function DateNavigator({ currentDate, onDateChange }: DateNavigatorProps) {
  const goToPrevDay = () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 1);
    onDateChange(prev);
  };

  const goToNextDay = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 1);
    onDateChange(next);
  };

  const goToToday = () => {
    onDateChange(new Date());
  };

  const label = getDayLabel(currentDate);
  const dateStr = currentDate.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const isToday = formatDateISO(currentDate) === formatDateISO(new Date());

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl bg-bg-card border border-border-subtle px-3 py-2.5 sm:px-5 sm:justify-center sm:gap-6"
      id="date-navigator"
    >
      <button
        onClick={goToPrevDay}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-all hover:bg-bg-elevated hover:text-text-primary"
        aria-label="Día anterior"
        id="date-nav-prev"
      >
        <ChevronLeft size={20} />
      </button>

      <div className="flex flex-col items-center gap-0.5 min-w-[140px]">
        <span className="text-sm font-bold text-text-primary">{label}</span>
        <span className="text-xs text-text-muted capitalize">{dateStr}</span>
      </div>

      <button
        onClick={goToNextDay}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary transition-all hover:bg-bg-elevated hover:text-text-primary"
        aria-label="Día siguiente"
        id="date-nav-next"
      >
        <ChevronRight size={20} />
      </button>

      {!isToday && (
        <button
          onClick={goToToday}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-accent-primary transition-all hover:bg-accent-primary hover:text-black"
          id="date-nav-today"
        >
          <Calendar size={13} />
          Hoy
        </button>
      )}
    </div>
  );
}
