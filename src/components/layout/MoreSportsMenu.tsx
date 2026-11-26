"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Medal, Volleyball } from "lucide-react";
import TennisRacketIcon from "@/components/icons/TennisRacketIcon";
import BoxingGloveIcon from "@/components/icons/BoxingGloveIcon";
import RacingHelmetIcon from "@/components/icons/RacingHelmetIcon";
import { useLanguage } from "@/contexts/LanguageContext";
import type { Dictionary } from "@/i18n/dictionaries";

const ITEMS = [
  { href: "/nba", icon: Volleyball, color: "#f97316", label: (t: Dictionary) => t.nba.nav },
  { href: "/boxeo", icon: BoxingGloveIcon, color: "#ef4444", label: (t: Dictionary) => t.combat.nav },
  { href: "/tennis", icon: TennisRacketIcon, color: "#eab308", label: (t: Dictionary) => t.tennis.nav },
  { href: "/motor", icon: RacingHelmetIcon, color: "#a855f7", label: (t: Dictionary) => t.motor.nav },
] as const;

/** NBA / BOXEO / TENIS grouped behind one navbar dropdown. */
export default function MoreSportsMenu() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const activeItem = ITEMS.find((item) => isActive(pathname, item.href));
  const ButtonIcon = activeItem ? activeItem.icon : Medal;

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
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={activeItem
          ? "flex items-center gap-1.5 px-3 py-1.5 border-2 bg-black font-black text-xs sm:text-sm uppercase transition-colors"
          : "flex items-center gap-1.5 px-3 py-1.5 border-2 border-white bg-black shadow-[4px_4px_0px_0px_#a3e635] font-black text-xs sm:text-sm text-white hover:text-[#a3e635] hover:border-[#a3e635] hover:shadow-[4px_4px_0px_0px_#a3e635] transition-colors uppercase"}
        style={activeItem
          ? {
              borderColor: activeItem.color,
              color: activeItem.color,
              boxShadow: `4px 4px 0px 0px ${activeItem.color}`,
            }
          : undefined}
        id="header-more-sports"
      >
        <ButtonIcon size={14} strokeWidth={3} />
        <span>{t.header.moreSports}</span>
        <ChevronDown size={13} strokeWidth={3} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-[110] mt-2 flex w-44 flex-col gap-1.5 border-4 border-black bg-bg-primary p-2 shadow-[6px_6px_0px_0px_#a3e635]"
        >
          {ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setIsOpen(false)}
                className={`flex items-center justify-center gap-2 border-2 px-3 py-2 font-black text-xs uppercase transition-colors ${
                  active
                    ? "border-black bg-black text-white"
                    : "border-white/40 bg-black text-white/80 hover:border-white hover:text-white"
                }`}
                style={active ? { borderColor: item.color, color: item.color, boxShadow: `4px 4px 0px 0px ${item.color}` } : undefined}
              >
                <Icon size={14} strokeWidth={3} style={{ color: item.color }} />
                <span>{item.label(t)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || pathname?.startsWith(`${href}/`) === true;
}
