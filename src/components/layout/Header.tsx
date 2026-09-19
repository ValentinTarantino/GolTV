"use client";

import Link from "next/link";
import { Tv, Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import SearchBar from "@/components/search/SearchBar";
import MobileMenu from "@/components/search/MobileMenu";

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
            className="flex items-center gap-2 sm:gap-3 text-lg sm:text-2xl font-black tracking-tight transition-transform hover:-translate-y-1"
            id="header-logo"
          >
            <div className="relative flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center bg-accent-primary border-4 border-black shadow-brutal-white">
              <Tv size={20} strokeWidth={3} className="text-black" />
              <div className="absolute -right-1.5 -top-1.5 sm:-right-2 sm:-top-2 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center bg-accent-secondary border-2 border-white">
                <Zap size={12} strokeWidth={3} className="text-white" />
              </div>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-white uppercase text-sm sm:text-base">GolTV</span>
              <span className="text-accent-primary font-black text-xs sm:text-sm uppercase tracking-widest">
                Libre
              </span>
            </div>
          </Link>

          {/* Desktop: Search + Language */}
          <div className="hidden md:flex items-center gap-2">
            <SearchBar />
            <div className="flex items-center border-2 border-white bg-black shadow-brutal-sm font-black text-xs sm:text-sm">
              <button
                onClick={() => setLanguage('es')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 transition-colors ${
                  language === 'es' ? 'bg-white text-black' : 'text-white hover:text-accent-primary'
                }`}
              >
                ES
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 transition-colors ${
                  language === 'en' ? 'bg-white text-black' : 'text-white hover:text-accent-primary'
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


