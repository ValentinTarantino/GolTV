"use client";

import { Tv, Flame } from "lucide-react";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="mt-20 border-t-4 border-white bg-black pt-12 pb-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 md:grid-cols-3">
          
          {/* Brand */}
          <div className="flex flex-col gap-4">
            <Link 
              href="/" 
              className="inline-flex items-center gap-3 bg-accent-primary border-4 border-black px-4 py-2 shadow-brutal-white w-max transform transition-transform hover:-translate-y-1 hover:rotate-1"
            >
              <Tv size={24} strokeWidth={3} className="text-black" />
              <span className="text-2xl font-black text-black uppercase tracking-tighter">
                GolTV Libre
              </span>
            </Link>
            <p className="text-base font-bold text-white uppercase mt-2 max-w-xs">
              {t.footer.description}
            </p>
          </div>

          {/* Info */}
          <div>
            <h3 className="mb-4 inline-block bg-white text-black px-3 py-1 text-xl font-black uppercase border-2 border-white">
              <Flame size={20} className="inline-block mr-2 text-accent-secondary" strokeWidth={3} />
              {t.footer.featuresTitle}
            </h3>
            <ul className="space-y-3 font-bold text-white/80 uppercase tracking-wide">
              {t.footer.features.map((feature, idx) => (
                <li key={idx} className="hover:text-accent-primary transition-colors cursor-default">
                  {feature}
                </li>
              ))}
            </ul>
          </div>

          {/* Warning/Disclaimer */}
          <div>
            <div className="bg-accent-secondary border-4 border-black p-4 shadow-brutal transform rotate-1">
              <h3 className="text-xl font-black text-black uppercase mb-2">{t.footer.legalTitle}</h3>
              <p className="text-sm font-bold text-black uppercase leading-tight">
                {t.footer.legalText}
              </p>
            </div>
          </div>

        </div>
      </div>
    </footer>
  );
}


