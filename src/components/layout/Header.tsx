"use client";

import Link from "next/link";
import { Tv, Zap } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

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
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-3 text-2xl font-black tracking-tight transition-transform hover:-translate-y-1"
            id="header-logo"
          >
            <div className="relative flex h-12 w-12 items-center justify-center bg-accent-primary border-4 border-black shadow-brutal-white">
              <Tv size={24} strokeWidth={3} className="text-black" />
              <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center bg-accent-secondary border-2 border-white">
                <Zap size={14} strokeWidth={3} className="text-white" />
              </div>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-white uppercase">GolTV</span>
              <span className="text-accent-primary font-black text-sm uppercase tracking-widest">
                Libre
              </span>
            </div>
          </Link>

          {/* Language Toggle */}
          <div className="flex items-center border-2 border-white bg-black shadow-brutal-sm font-black text-sm">
            <button
              onClick={() => setLanguage('es')}
              className={`px-3 py-1.5 transition-colors ${
                language === 'es' ? 'bg-white text-black' : 'text-white hover:text-accent-primary'
              }`}
            >
              ES
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`px-3 py-1.5 transition-colors ${
                language === 'en' ? 'bg-white text-black' : 'text-white hover:text-accent-primary'
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </header>
    </>
  );
}


