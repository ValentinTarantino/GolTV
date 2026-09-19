"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export default function LiveBadge() {
  const { t } = useLanguage();
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-black uppercase tracking-wider bg-accent-red text-white border-2 border-white shadow-badge before:content-[''] before:w-2 before:h-2 before:bg-white before:block" id="live-badge">
      {t.home.live}
    </span>
  );
}
