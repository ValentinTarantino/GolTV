"use client";

import { useLanguage } from "@/contexts/LanguageContext";

/**
 * Network/IP warning. Back to the card layout: full sentence with the two key
 * phrases highlighted and the three provider buttons in their brand colours.
 * What changed is the weight — a single lime border with a soft static glow
 * (site accent, no colour-cycling pulse) and tighter padding/type, so it reads
 * as a notice inside the page instead of a neon sign pushing the agenda down.
 */
export default function NetworkNotice() {
  const { t } = useLanguage();

  const linkClass =
    "inline-flex shrink-0 items-center justify-center border-2 border-black px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white transition-all duration-150 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:px-3 sm:text-[11px]";

  return (
    <aside
      role="note"
      className="mb-4 flex flex-col gap-2.5 border-2 border-accent-primary bg-black p-3 shadow-[0_0_18px_rgba(204,255,0,0.40)] transition-shadow duration-300 hover:shadow-[0_0_24px_rgba(204,255,0,0.55)] sm:mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-3.5"
    >
      <p className="text-[11px] font-bold leading-snug text-white sm:text-[13px]">
        {t.home.networkNotice}{" "}
        <span className="text-accent-primary">{t.home.networkNoticeImmediate}</span>{" "}
        <span className="text-orange-400">{t.home.networkNoticeOptions}</span>
      </p>
      <div className="flex shrink-0 flex-wrap gap-1.5 sm:gap-2">
        <a
          href="https://one.one.one.one/"
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkClass} bg-orange-700 hover:bg-orange-600`}
        >
          {t.home.downloadOne}
        </a>
        <a
          href="https://protonvpn.com/es-419"
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkClass} bg-violet-600 hover:bg-violet-500`}
        >
          {t.home.protonVpn}
        </a>
        <a
          href="https://www.urban-vpn.com/es/"
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkClass} bg-teal-700 hover:bg-teal-600`}
        >
          {t.home.urbanVpn}
        </a>
      </div>
    </aside>
  );
}
