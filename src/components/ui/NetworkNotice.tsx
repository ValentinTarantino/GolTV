"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";

const borderColors = [
  [
    "border-[#ccff00] shadow-[0_0_14px_3px_#ccff00]",
    "border-[#ccff00] shadow-[0_0_5px_1px_#ccff00]",
  ],
  [
    "border-[#ffffff] shadow-[0_0_14px_3px_#ffffff]",
    "border-[#ffffff] shadow-[0_0_5px_1px_#ffffff]",
  ],
  [
    "border-[#00f0ff] shadow-[0_0_14px_3px_#00f0ff]",
    "border-[#00f0ff] shadow-[0_0_5px_1px_#00f0ff]",
  ],
  [
    "border-[#ffe66d] shadow-[0_0_14px_3px_#ffe66d]",
    "border-[#ffe66d] shadow-[0_0_5px_1px_#ffe66d]",
  ],
] as const;

export default function NetworkNotice() {
  const { t } = useLanguage();
  const [pulseStep, setPulseStep] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const intervalId = window.setInterval(() => {
      setPulseStep((step) => step + 1);
    }, 1500);
    return () => window.clearInterval(intervalId);
  }, []);

  const borderColorIndex = Math.floor(pulseStep / 2) % borderColors.length;
  const borderPulseIndex = pulseStep % 2;

  return (
    <aside className={`mb-4 flex flex-wrap items-center justify-between gap-2 border-4 ${borderColors[borderColorIndex][borderPulseIndex]} bg-black p-3 text-xs font-bold text-white transition-[border-color,box-shadow] duration-[1500ms] ease-in-out sm:mb-5 sm:p-4 sm:text-sm lg:p-5 lg:text-base`} role="note">
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
          className="shrink-0 border-2 border-black bg-orange-700 px-3 py-1.5 font-black text-white transition-colors hover:-translate-y-0.5 hover:bg-orange-800 lg:px-4 lg:py-2"
        >
          {t.home.downloadOne}
        </a>
        <a
          href="https://protonvpn.com/es-419"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 border-2 border-black bg-violet-600 px-3 py-1.5 font-black text-white transition-colors hover:-translate-y-0.5 hover:bg-violet-700 lg:px-4 lg:py-2"
        >
          {t.home.protonVpn}
        </a>
        <a
          href="https://www.urban-vpn.com/es/"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 border-2 border-black bg-teal-700 px-3 py-1.5 font-black text-white transition-colors hover:-translate-y-0.5 hover:bg-teal-800 lg:px-4 lg:py-2"
        >
          {t.home.urbanVpn}
        </a>
      </div>
    </aside>
  );
}
