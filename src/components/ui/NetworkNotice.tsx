"use client";

import { useLanguage } from "@/contexts/LanguageContext";

export default function NetworkNotice() {
  const { t } = useLanguage();

  return (
    <aside className="mb-4 flex flex-wrap items-center justify-between gap-2 border-3 border-white bg-black p-3 text-xs font-bold text-white shadow-brutal-sm sm:mb-5 sm:p-4 sm:text-sm" role="note">
      <p>
        {t.home.networkNotice} {" "}
        <strong className="text-accent-primary">{t.home.networkNoticeImmediate}</strong>{" "}
        <strong className="text-orange-400">{t.home.networkNoticeOptions}</strong>
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href="https://one.one.one.one/"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 border-2 border-black bg-orange-700 px-3 py-1.5 font-black text-white transition-colors hover:-translate-y-0.5 hover:bg-orange-800"
        >
          {t.home.downloadOne}
        </a>
        <a
          href="https://protonvpn.com/es-419"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 border-2 border-black bg-violet-600 px-3 py-1.5 font-black text-white transition-colors hover:-translate-y-0.5 hover:bg-violet-700"
        >
          {t.home.protonVpn}
        </a>
        <a
          href="https://www.urban-vpn.com/es/"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 border-2 border-black bg-teal-700 px-3 py-1.5 font-black text-white transition-colors hover:-translate-y-0.5 hover:bg-teal-800"
        >
          {t.home.urbanVpn}
        </a>
      </div>
    </aside>
  );
}
