"use client";

import { useEffect, useState } from "react";
import { AlertCircle, X, Info, ExternalLink } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import FootballLoader from "@/components/ui/FootballLoader";
import { useIframeChannelBridge, type IframeChannelBridgeProps } from "./useIframeChannelBridge";

interface IframePlayerProps extends IframeChannelBridgeProps {
  url: string;
  title?: string;
}

export default function IframePlayer(props: IframePlayerProps) {
  return <IframeSession key={props.url} {...props} />;
}

function IframeSession({ url, title, channel, onChannels }: IframePlayerProps) {
  const { t, language } = useLanguage();
  const isPrimaryFeed = channel?.provider === "primary-feed";
  // Player 1 plays through the bare-frame route, so its iframe is one of our
  // own documents: no provider chrome and no brutalist border around it. The
  // channel list stays outside this component and is unaffected.
  const borderless = channel?.provider === "secondary-feed";
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showTip, setShowTip] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  
  // Keep the provider's published URL intact. Rewriting every iframe through
  // our origin turns nested player pages into localhost frames, which Firefox
  // and some providers then reject. Only the two legacy exceptions need the
  // compatibility proxy.
  const getProxyUrl = (originalUrl: string) => {
    // Player 1 publishes *scraped* channel pages. Serving those directly shows
    // the scraper's white shell around the stream, so they go through the
    // bare-frame route: black document + deepest player only.
    if (channel?.provider === "secondary-feed") {
      return `/api/secondary?u=${encodeURIComponent(originalUrl)}&lang=${language}`;
    }
    if (originalUrl.includes("futbolvivo.tv") || originalUrl.includes("kora-plus.mov")) {
      return `/api/proxy?url=${encodeURIComponent(originalUrl)}`;
    }
    return originalUrl;
  };
  
  const proxiedUrl = getProxyUrl(url);
  const frame = useIframeChannelBridge(proxiedUrl, { channel, onChannels }, attempt);

  useEffect(() => {
    if (isPrimaryFeed) return;
    if (!isLoading) return;
    const timer = setTimeout(() => {
      setIsLoading(false);
      setTimedOut(true);
    }, 15000);
    return () => clearTimeout(timer);
  }, [isPrimaryFeed, isLoading, attempt]);

  const dismissTip = () => {
    setShowTip(false);
  };

  return (
    <>
      {showTip && (
        <div data-player-tip className="flex items-center justify-between gap-2 px-3 py-2 mb-2 bg-accent-secondary border-2 border-black shadow-brutal-sm">
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

      {isPrimaryFeed && (
        <div className="flex w-full aspect-video items-center justify-center">
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 border-2 border-white bg-black px-3 py-2 text-xs font-bold text-white hover:border-accent-primary hover:text-accent-primary"
          >
            <ExternalLink size={14} />
            {t.player.openSignalNewTab}
          </a>
        </div>
      )}

      {!isPrimaryFeed && (timedOut || hasError) && (
        <div role="status" className="mb-2 flex flex-wrap items-center gap-3 border-2 border-white bg-black p-3 text-sm text-white">
          <span>{t.player.externalLoadTimeout}</span>
          <button type="button" className="border-2 border-white px-3 py-1" onClick={() => {
            setHasError(false);
            setTimedOut(false);
            setIsLoading(true);
            setAttempt((value) => value + 1);
          }}>{t.player.retry}</button>
        </div>
      )}
      {!isPrimaryFeed && (
        <div className={`relative w-full aspect-video bg-black overflow-hidden${borderless ? "" : " border-4 border-white shadow-brutal"}`}>
        {!isPrimaryFeed && isLoading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <div className="flex flex-col items-center gap-3">
              <FootballLoader size={56} />
              <span className="text-sm text-text-secondary">{t.player.loadingStream}</span>
            </div>
          </div>
        )}

        {!isPrimaryFeed && hasError && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/80 z-20">
            <div className="flex flex-col items-center gap-3 text-center px-6">
              <AlertCircle size={40} className="text-accent-red" />
              <span className="text-sm font-medium text-text-primary">
                {t.player.errorLoading}
              </span>
            </div>
          </div>
        )}

        {title && !isPrimaryFeed && !isLoading && (
          <div className="pointer-events-none absolute top-0 left-0 right-0 p-3 z-10 bg-gradient-to-b from-black/60 to-transparent">
            <span className="text-xs font-medium text-white/90">{title}</span>
          </div>
        )}

        <iframe
          ref={frame}
          key={attempt}
          src={proxiedUrl}
          referrerPolicy="no-referrer"
          className="w-full h-full border-0"
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write; accelerometer; gyroscope; geolocation; microphone; camera"
          allowFullScreen
          onLoad={() => {
            if (!isPrimaryFeed) {
              setIsLoading(false);
              setTimedOut(false);
            }
          }}
          onError={() => {
            if (!isPrimaryFeed) {
              setIsLoading(false);
              setHasError(true);
            }
          }}
          title={title || "Stream"}
        />
        </div>
      )}
    </>
  );
}
