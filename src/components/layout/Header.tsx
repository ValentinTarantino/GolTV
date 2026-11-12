"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import LpfPlayMark from "@/components/lpf/LpfPlayMark";
import SearchBar from "@/components/search/SearchBar";
import MobileMenu from "@/components/search/MobileMenu";
import TimeZoneSelect from "@/components/layout/TimeZoneSelect";

export default function Header() {
  const { language, setLanguage, t } = useLanguage();
  const tickerItems = t.header.ticker;

  return (
    <>
      {/* Brutalist Top Marquee / Ticker */}
      <div className="w-full bg-accent-primary text-black border-b-2 border-white py-1.5 overflow-hidden select-none font-black text-xs sm:text-sm uppercase tracking-wider">
        <div className="animate-marquee flex items-center whitespace-nowrap">
          {[...tickerItems, ...tickerItems, ...tickerItems, ...tickerItems].map((item, idx) => (
            <span key={idx} className="flex items-center mx-4">
              <span>{item}</span>
              <span className="mx-4 text-black font-black">✦</span>
            </span>
          ))}
        </div>
      </div>

      <header className="sticky top-0 z-50 bg-bg-primary border-b-4 border-white">
        <div className="mx-auto flex h-16 sm:h-20 max-w-7xl items-center justify-between px-3 sm:px-4 md:px-6">
          {/* Logo */}
          <Link
            href="/"
            className="group flex items-center gap-1 sm:gap-2 font-black tracking-tight"
            id="header-logo"
          >
            <LpfPlayMark className="h-10 w-[3.5rem] shrink-0 sm:h-16 sm:w-[5.35rem]" />
            <span className="relative translate-y-[1px] whitespace-nowrap text-2xl sm:text-4xl font-black italic uppercase leading-none tracking-[-0.06em] text-white sm:translate-y-[4px]">
              GOLTV <span className="text-accent-primary">LIBRE</span>
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-1 h-[3px] sm:h-1 origin-left scale-x-0 bg-accent-primary transition-transform duration-300 ease-out group-hover:scale-x-100 motion-reduce:transition-none"
              />
            </span>
          </Link>

          {/* Desktop: Search + Leagues + Language */}
          <div className="hidden md:flex items-center gap-2">
            <SearchBar />
            <Link
              href="/leagues"
              className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#38bdf8] bg-black shadow-[4px_4px_0px_0px_#38bdf8] font-black text-xs sm:text-sm text-white hover:text-[#38bdf8] hover:border-[#38bdf8] transition-colors uppercase"
            >
              <Trophy size={14} strokeWidth={3} />
              <span>{t.leagues?.title || "LIGAS"}</span>
            </Link>
            <Link
              href="/lpf"
              className="flex items-center gap-1.5 px-3 py-1.5 border-2 border-accent-secondary bg-black shadow-[4px_4px_0px_0px_var(--color-accent-secondary)] font-black text-xs sm:text-sm text-white hover:text-accent-secondary transition-colors uppercase"
              id="header-lpf-play"
            >
              <span>{t.lpf?.nav || "LPF PLAY"}</span>
            </Link>
            <TimeZoneSelect />
            <div className="flex items-center border-2 border-[#a3e635] bg-black shadow-[4px_4px_0px_0px_#a3e635] font-black text-xs sm:text-sm">
              <button
                onClick={() => setLanguage('es')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 transition-colors ${
                  language === 'es' ? 'bg-[#a3e635] text-black' : 'text-white hover:text-[#a3e635]'
                }`}
              >
                ES
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 transition-colors ${
                  language === 'en' ? 'bg-[#a3e635] text-black' : 'text-white hover:text-[#a3e635]'
                }`}
              >
                EN
              </button>
            </div>
          </div>

          {/* Mobile: Hamburger */}
          <MobileMenu />
        </div>
      </header>
    </>
  );
}


