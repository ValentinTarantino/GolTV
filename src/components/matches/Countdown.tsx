"use client";

import { useState, useEffect } from "react";
import { getCountdown } from "@/lib/utils";

interface CountdownProps {
  timestamp: number;
}

export default function Countdown({ timestamp }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState(() => getCountdown(timestamp));

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(getCountdown(timestamp));
    }, 1000);

    return () => clearInterval(interval);
  }, [timestamp]);

  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-sm font-semibold text-[var(--accent-secondary)] tabular-nums"
      id="match-countdown"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" className="opacity-70">
        <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="6" y1="6" x2="6" y2="3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="6" y1="6" x2="8" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {timeLeft}
    </span>
  );
}
