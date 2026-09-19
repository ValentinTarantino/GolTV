"use client";

import { useState } from "react";
import { AlertCircle, X, Info } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import FootballLoader from "@/components/ui/FootballLoader";

interface IframePlayerProps {
  url: string;
  title?: string;
}

export default function IframePlayer({ url, title }: IframePlayerProps) {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showTip, setShowTip] = useState(true);

  const dismissTip = () => {
    setShowTip(false);
  };

  return (
    <>
      {showTip && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 mb-2 bg-accent-secondary border-2 border-black shadow-brutal-sm">
          <div className="flex items-center gap-2 min-w-0">
            <Info size={14} strokeWidth={3} className="shrink-0 text-white" />
            <span className="text-xs sm:text-sm font-bold text-white truncate">
              {t.player.adBlockerTip}
            </span>
          </div>
          <button
            type="button"
            onClick={dismissTip}
            className="shrink-0 flex h-6 w-6 items-center justify-center text-white hover:text-black transition-colors"
          >
            <X size={14} strokeWidth={3} />
          </button>
        </div>
      )}

      <div className="relative w-full aspect-video bg-black overflow-hidden border-4 border-white shadow-brutal">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="flex flex-col items-center gap-3">
              <FootballLoader size={56} />
              <span className="text-sm text-text-secondary">{t.player.loadingStream}</span>
            </div>
          </div>
        )}

        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <AlertCircle size={40} className="text-accent-red" />
              <span className="text-sm font-medium text-text-primary">
                {t.player.errorLoading}
              </span>
            </div>
          </div>
        )}

        {title && !isLoading && (
          <div className="absolute top-0 left-0 right-0 p-3 z-10 bg-gradient-to-b from-black/60 to-transparent">
            <span className="text-xs font-medium text-white/90">{title}</span>
          </div>
        )}

        <iframe
          src={url}
          className="w-full h-full border-0"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
          allowFullScreen
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          title={title || "Stream"}
        />
      </div>
    </>
  );
}
