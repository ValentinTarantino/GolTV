"use client";

import { useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface IframePlayerProps {
  url: string;
  title?: string;
}

export default function IframePlayer({ url, title }: IframePlayerProps) {
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  return (
    <div className="relative w-full aspect-video bg-black overflow-hidden border-4 border-white shadow-brutal">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={40} className="animate-spin text-accent-primary" />
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
  );
}
