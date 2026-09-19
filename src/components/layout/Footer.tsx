"use client";

import { Tv, Flame } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="mt-12 sm:mt-20 border-t-4 border-white bg-black pt-8 sm:pt-12 pb-8 sm:pb-12">
      <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6">
        <div className="grid grid-cols-1 gap-8 sm:gap-12 sm:grid-cols-2 md:grid-cols-3">

          {/* Brand */}
          <div className="flex flex-col gap-3 sm:gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 sm:gap-3 bg-accent-primary border-4 border-black px-3 sm:px-4 py-1.5 sm:py-2 shadow-brutal-white w-max transform transition-transform hover:-translate-y-1 hover:rotate-1"
            >
              <Tv size={20} strokeWidth={3} className="text-black" />
              <span className="text-xl sm:text-2xl font-black text-black uppercase tracking-tighter">
                GolTV Libre
              </span>
            </Link>
            <p className="text-sm sm:text-base font-bold text-white uppercase mt-2 max-w-xs">
              {t.footer.description}
            </p>
          </div>

          {/* Info */}
          <div>
            <h3 className="mb-3 sm:mb-4 inline-block bg-white text-black px-2 sm:px-3 py-0.5 sm:py-1 text-lg sm:text-xl font-black uppercase border-2 border-white">
              <Flame size={16} strokeWidth={3} className="inline-block mr-1.5 sm:mr-2 text-accent-secondary" />
              {t.footer.featuresTitle}
            </h3>
            <ul className="space-y-2 sm:space-y-3 font-bold text-white/80 uppercase tracking-wide text-sm sm:text-base">
              {t.footer.features.map((feature, idx) => (
                <li key={idx} className="hover:text-accent-primary transition-colors cursor-default">
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Warning/Disclaimer */}
          <div>
            <div className="bg-accent-secondary border-4 border-black p-3 sm:p-4 shadow-brutal transform rotate-1">
              <h3 className="text-lg sm:text-xl font-black text-black uppercase mb-1.5 sm:mb-2">{t.footer.legalTitle}</h3>
              <p className="text-xs sm:text-sm font-bold text-black uppercase leading-tight">
                {t.footer.legalText}
              </p>
            </div>
          </div>

        </div>
      </div>
    </footer>
  );
}


