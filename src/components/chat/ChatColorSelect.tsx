"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { CHAT_COLOR_OPTIONS } from "@/lib/chat-colors";

interface ChatColorSelectProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  alignEnd?: boolean;
}

export default function ChatColorSelect({ label, value, onChange, alignEnd = false }: ChatColorSelectProps) {
  const { t } = useLanguage();
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = Math.max(0, CHAT_COLOR_OPTIONS.findIndex(option => option.value === value));

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector('[data-active="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  const choose = (index: number) => {
    onChange(CHAT_COLOR_OPTIONS[index].value);
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      return;
    }
    if (event.key === "Tab") { setOpen(false); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      if ((event.key === "Enter" || event.key === " ") && open) { choose(active); return; }
      if (event.key === "Home") setActive(0);
      else if (event.key === "End") setActive(CHAT_COLOR_OPTIONS.length - 1);
      else if (!open) setActive(selected);
      else setActive(index => (index + (event.key === "ArrowUp" ? -1 : 1) + CHAT_COLOR_OPTIONS.length) % CHAT_COLOR_OPTIONS.length);
      setOpen(true);
    }
  };

  return (
    <div ref={root} className="relative min-w-0" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <span className="mb-1 block text-[10px] font-bold text-gray-300">{label}</span>
      <button ref={trigger} type="button" role="combobox" aria-label={label}
        aria-haspopup="listbox" aria-controls={`${id}-list`} aria-expanded={open}
        aria-activedescendant={open ? `${id}-option-${active}` : undefined}
        onClick={() => { setActive(selected); setOpen(previous => !previous); }} onKeyDown={onKeyDown}
        style={{ color: value }} data-value={value}
        className="flex w-full min-w-0 items-center justify-between gap-2 border border-white/40 bg-black px-2 py-1.5 text-left text-xs font-bold hover:bg-[#181818] focus-visible:outline-2 focus-visible:outline-accent-primary">
        <span>{t.chat.colors[CHAT_COLOR_OPTIONS[selected].name]}</span><ChevronDown size={14} className="shrink-0" />
      </button>
      {open && <div ref={list} id={`${id}-list`} role="listbox" aria-label={label}
        className={`absolute bottom-full z-50 mb-1 grid max-h-64 w-[min(16rem,calc(100vw-3rem))] grid-cols-2 gap-1 overflow-y-auto border-2 border-white/60 bg-black p-1 shadow-lg ${alignEnd ? "right-0" : "left-0"}`}>
        {CHAT_COLOR_OPTIONS.map((option, index) => (
          <button key={option.value} id={`${id}-option-${index}`} type="button" role="option" tabIndex={-1}
            aria-selected={option.value === value} data-active={active === index} data-value={option.value}
            onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}
            style={{ color: option.value }}
            className="flex items-center gap-2 border border-transparent bg-black px-2 py-2 text-left text-xs font-bold hover:bg-[#181818] data-[active=true]:bg-[#181818] aria-selected:border-accent-primary">
            <span aria-hidden="true" className="h-3 w-3 shrink-0" style={{ backgroundColor: option.value }} />
            {t.chat.colors[option.name]}
          </button>
        ))}
      </div>}
    </div>
  );
}
