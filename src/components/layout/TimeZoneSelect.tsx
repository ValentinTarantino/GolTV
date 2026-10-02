"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Clock3 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTimeZone } from "@/contexts/TimeZoneContext";
import {
  formatUtcOffset,
  getTimeZoneOffsetMinutes,
  TIME_ZONE_OPTIONS,
} from "@/lib/time-zones";

interface TimeZoneSelectProps {
  mobile?: boolean;
}

export default function TimeZoneSelect({ mobile = false }: TimeZoneSelectProps) {
  const { language, t } = useLanguage();
  const { timeZone, setTimeZone } = useTimeZone();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const available = TIME_ZONE_OPTIONS.some((option) => option.value === timeZone)
      ? TIME_ZONE_OPTIONS
      : [
          ...TIME_ZONE_OPTIONS,
          {
            value: timeZone,
            labelEs: `${timeZone.replaceAll("_", " ")} · zona detectada`,
            labelEn: `${timeZone.replaceAll("_", " ")} · detected zone`,
          },
        ];

    return available
      .map((option) => ({ ...option, offset: getTimeZoneOffsetMinutes(option.value) }))
      .sort((a, b) => a.offset - b.offset || a.value.localeCompare(b.value));
  }, [timeZone]);

  const groups = options.reduce<Map<number, typeof options>>((result, option) => {
    const group = result.get(option.offset) || [];
    group.push(option);
    result.set(option.offset, group);
    return result;
  }, new Map());

  const selectedOption = options.find((option) => option.value === timeZone);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div ref={rootRef} className={`relative ${mobile ? "w-full" : "shrink-0"}`}>
      {mobile && (
        <div className="mb-2 text-xs font-black uppercase text-white">{t.header.timeZone}</div>
      )}
      <button
        type="button"
        aria-label={`${t.header.timeZone}: ${selectedOption ? (language === "es" ? selectedOption.labelEs : selectedOption.labelEn) : timeZone}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={mobile
          ? "flex min-h-11 w-full items-center justify-between gap-3 border-2 border-black bg-accent-primary px-3 py-2 text-left text-sm font-black uppercase text-black shadow-brutal-sm transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          : "flex h-9 max-w-[190px] items-center gap-2 border-2 border-[#38bdf8] bg-black px-2 text-left text-xs font-black uppercase text-white shadow-[4px_4px_0px_0px_#38bdf8] transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"}
      >
        <Clock3 size={mobile ? 17 : 15} aria-hidden="true" className={`shrink-0 ${mobile ? "text-black" : "text-[#38bdf8]"}`} />
        <span className="min-w-0 flex-1 truncate">
          {mobile
            ? selectedOption && (language === "es" ? selectedOption.labelEs : selectedOption.labelEn)
            : `${formatUtcOffset(getTimeZoneOffsetMinutes(timeZone))} · ${timeZone.split("/").at(-1)?.replaceAll("_", " ")}`}
        </span>
        <ChevronDown size={15} aria-hidden="true" className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label={t.header.timeZone}
          className={`absolute z-[120] mt-2 max-h-[min(65vh,28rem)] overflow-y-auto overscroll-contain border-4 border-black bg-white text-black shadow-[6px_6px_0px_0px_var(--color-accent-secondary)] ring-2 ring-accent-primary ${mobile ? "left-0 right-0" : "right-0 w-[min(22rem,calc(100vw-1.5rem))]"}`}
        >
          {[...groups.entries()].map(([offset, group]) => (
            <div key={offset}>
              <div className="sticky top-0 z-10 flex items-center justify-between border-y-2 border-black bg-accent-primary px-3 py-1.5 text-[11px] font-black uppercase">
                <span>{t.header.utcOffset}</span>
                <span>{formatUtcOffset(offset)}</span>
              </div>
              {group.map((option) => {
                const selected = option.value === timeZone;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      setTimeZone(option.value);
                      setIsOpen(false);
                    }}
                    className={`flex min-h-11 w-full items-center justify-between gap-3 border-b border-black/15 px-3 py-2 text-left text-xs font-bold transition-colors hover:bg-black hover:text-white focus-visible:bg-black focus-visible:text-white focus-visible:outline-none ${selected ? "bg-black text-white" : "bg-white text-black"}`}
                  >
                    <span className="min-w-0 break-words">
                      {language === "es" ? option.labelEs : option.labelEn}
                    </span>
                    {selected && <Check size={16} aria-hidden="true" className="shrink-0 text-accent-primary" />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}