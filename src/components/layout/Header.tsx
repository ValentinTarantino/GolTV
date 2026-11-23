"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy, Tv, Play } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import LpfPlayMark from "@/components/lpf/LpfPlayMark";
import SearchBar from "@/components/search/SearchBar";
import MobileMenu from "@/components/search/MobileMenu";
import TimeZoneSelect from "@/components/layout/TimeZoneSelect";

export default function Header() {
  const { language, setLanguage, t } = useLanguage();
  const tickerItems = t.header.ticker;
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`) === true;

  return (
    <>
      {/* Brutalist Top Marquee / Ticker — one slim lime line: black on lime so
          it reads at a glance instead of glowing white over the accent. */}
      <div className="h-[26px] w-full overflow-hidden border-b-2 border-white bg-accent-primary text-black select-none font-black text-[10px] uppercase tracking-[0.22em] sm:text-[11px]">
        <div className="animate-marquee flex h-full items-center whitespace-nowrap">
          {[...tickerItems, ...tickerItems, ...tickerItems, ...tickerItems].map((item, idx) => (
            <span key={idx} className="flex items-center gap-5 px-5">
              <span>{item}</span>
              <span className="text-black/35">✦</span>
            </span>
          ))}
        </div>
      </div>

      <header className="sticky top-0 z-50 bg-bg-primary border-b-4 border-white">
        <div className="mx-auto flex h-14 min-w-0 max-w-7xl items-center justify-between gap-2 px-3 sm:h-16 sm:px-4 md:px-6 xl:h-20">
          {/* Logo */}
          <Link
            href="/"
            className="group flex min-w-0 shrink items-center gap-1 font-black tracking-tight sm:gap-2"
            id="header-logo"
          >
            <LpfPlayMark className="h-8 w-[2.8rem] shrink-0 sm:h-12 sm:w-16 xl:h-16 xl:w-[5.35rem]" />
            <span className="relative translate-y-[1px] whitespace-nowrap text-xl font-black italic uppercase leading-none tracking-[-0.06em] sm:text-3xl sm:translate-y-[3px] xl:translate-y-[4px] xl:text-4xl">
              <span
                className="mr-0 inline-block overflow-visible bg-clip-text pr-[0.18em] text-transparent"
                style={{
                  backgroundImage: "linear-gradient(to bottom, #75AADB 0%, #75AADB 34%, #FFFFFF 34%, #FFFFFF 66%, #75AADB 66%, #75AADB 100%)",
                  WebkitBackgroundClip: "text",
                }}
              >
                G<span className="relative">O<span aria-hidden className="absolute left-[70%] top-1/2 h-[0.55em] w-[0.37em] -translate-x-1/2 -translate-y-1/2 skew-x-[-11.5deg] rounded-full bg-[#ffcc00]" /></span>LTV
              </span>
              <span className="text-accent-primary">LIBRE</span>
              <span
                aria-hidden
                className="absolute inset-x-0 -bottom-1 h-[3px] sm:h-1 origin-left scale-x-0 bg-accent-primary transition-transform duration-300 ease-out group-hover:scale-x-100 motion-reduce:transition-none"
              />
            </span>
          </Link>

          {/* Desktop: Search + Leagues + Language */}
          <div className="hidden xl:flex items-center gap-2">
            <SearchBar />
            <Link
              href="/leagues"
              className={isActive("/leagues")
                ? "flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#3b82f6] bg-black shadow-[4px_4px_0px_0px_#3b82f6] font-black text-xs sm:text-sm text-[#3b82f6] uppercase"
                : "flex items-center gap-1.5 px-3 py-1.5 border-2 border-white bg-black shadow-[4px_4px_0px_0px_#a3e635] font-black text-xs sm:text-sm text-white hover:text-[#3b82f6] hover:border-[#3b82f6] hover:shadow-[4px_4px_0px_0px_#3b82f6] transition-colors uppercase"}
            >
              <Trophy size={14} strokeWidth={3} />
              <span>{t.leagues?.title || "LIGAS"}</span>
            </Link>
            <Link
              href="/canales"
              className={isActive("/canales")
                ? "flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#ff6b35] bg-black shadow-[4px_4px_0px_0px_#ff6b35] font-black text-xs sm:text-sm text-[#ff6b35] uppercase"
                : "flex items-center gap-1.5 px-3 py-1.5 border-2 border-white bg-black shadow-[4px_4px_0px_0px_#a3e635] font-black text-xs sm:text-sm text-white hover:text-[#ff6b35] hover:border-[#ff6b35] hover:shadow-[4px_4px_0px_0px_#ff6b35] transition-colors uppercase"}
              id="header-canales"
            >
              <Tv size={14} strokeWidth={3} />
              <span>{t.canales?.nav || "CANALES"}</span>
            </Link>
            <Link
              href="/lpf"
              className={isActive("/lpf")
                ? "flex items-center gap-1.5 px-3 py-1.5 border-2 border-[#38bdf8] bg-black shadow-[4px_4px_0px_0px_#38bdf8] font-black text-xs sm:text-sm text-[#38bdf8] uppercase"
                : "flex items-center gap-1.5 px-3 py-1.5 border-2 border-white bg-black shadow-[4px_4px_0px_0px_#a3e635] font-black text-xs sm:text-sm text-white hover:text-[#38bdf8] hover:border-[#38bdf8] hover:shadow-[4px_4px_0px_0px_#38bdf8] transition-colors uppercase"}
              id="header-lpf"
            >
              <Play size={14} strokeWidth={3} fill="currentColor" />
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


