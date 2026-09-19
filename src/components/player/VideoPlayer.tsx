"use client";

import { useRef, useEffect, useState } from "react";
import Hls from "hls.js";
import { Play, Pause, Maximize, Volume2, VolumeX, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface HlsPlayerProps {
  url: string;
  title?: string;
  headers?: Record<string, string>;
}

function HlsPlayer({ url, title, headers }: HlsPlayerProps) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsLoading(true);
    setHasError(false);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        xhrSetup: (xhr) => {
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              xhr.setRequestHeader(key, value);
            });
          }
        },
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        video.play().catch(() => {});
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setHasError(true);
          setIsLoading(false);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setTimeout(() => hls.startLoad(), 3000);
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener("loadedmetadata", () => {
        setIsLoading(false);
        video.play().catch(() => {});
      });
    } else {
      setHasError(true);
      setIsLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [url, headers, retryToken]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;

    let timeout: NodeJS.Timeout;
    const hide = () => {
      timeout = setTimeout(() => setShowControls(false), 3000);
    };

    hide();
    return () => clearTimeout(timeout);
  }, [isPlaying, showControls]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen();
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-video bg-black overflow-hidden border-3 sm:border-4 border-white shadow-brutal group cursor-pointer"
      onMouseMove={() => setShowControls(true)}
      onClick={togglePlay}
      id="video-player"
    >
      <video ref={videoRef} className="w-full h-full" playsInline autoPlay />

      <button
        onClick={(e) => {
          e.stopPropagation();
          setRetryToken((n) => n + 1);
        }}
        className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-black/50 text-white/90 transition-colors hover:bg-white/20"
        id="player-reload"
        title={t.player.reload}
      >
        <RefreshCw size={14} strokeWidth={3} />
      </button>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-2 sm:gap-3">
            <Loader2 size={32} strokeWidth={3} className="animate-spin text-accent-primary" />
            <span className="text-xs sm:text-sm text-text-secondary">{t.player.loadingStream}</span>
          </div>
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="flex flex-col items-center gap-2 sm:gap-3 text-center px-4 sm:px-6">
            <AlertCircle size={32} strokeWidth={3} className="text-accent-red" />
            <span className="text-xs sm:text-sm font-medium text-text-primary">{t.player.errorLoading}</span>
            <span className="text-[10px] sm:text-xs text-text-muted max-w-xs sm:max-w-sm">{t.player.tryAnotherChannel}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRetryToken((n) => n + 1);
              }}
              className="mt-1.5 sm:mt-2 bg-accent-primary text-black font-black uppercase text-[10px] sm:text-xs px-3 sm:px-4 py-1.5 sm:py-2 border-2 border-black shadow-btn hover:-translate-y-0.5 transition-all"
              id="player-retry-btn"
            >
              {t.player.retry}
            </button>
          </div>
        </div>
      )}

      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 transition-opacity duration-300 ${
          showControls || !isPlaying ? "opacity-100" : "opacity-0"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute top-0 left-0 right-0 p-2 sm:p-4">
          <span className="text-xs sm:text-sm font-medium text-white/90">{title ?? ""}</span>
        </div>

        {!isPlaying && !isLoading && !hasError && (
          <button
            onClick={togglePlay}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-accent-primary/90 text-black transition-all hover:scale-110 hover:bg-accent-primary"
            id="player-play-btn"
          >
            <Play size={20} strokeWidth={3} className="ml-1" />
          </button>
        )}

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between p-2 sm:p-3 md:p-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={togglePlay}
              className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
              id="player-toggle-play"
            >
              {isPlaying ? <Pause size={14} strokeWidth={3} /> : <Play size={14} strokeWidth={3} />}
            </button>
            <button
              onClick={toggleMute}
              className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
              id="player-toggle-mute"
            >
              {isMuted ? <VolumeX size={14} strokeWidth={3} /> : <Volume2 size={14} strokeWidth={3} />}
            </button>

            {isPlaying && (
              <div className="ml-1 sm:ml-2 flex items-center gap-1 sm:gap-1.5">
                <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-accent-red animate-pulse" />
                <span className="text-[10px] sm:text-xs font-semibold text-white/80">{t.player.live}</span>
              </div>
            )}
          </div>

          <button
            onClick={toggleFullscreen}
            className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
            id="player-fullscreen"
          >
            <Maximize size={14} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
}

import IframePlayer from "./IframePlayer";

interface VideoPlayerProps {
  url: string;
  title?: string;
  headers?: Record<string, string>;
  kind?: "hls" | "iframe";
}

export default function VideoPlayer({ url, title, headers, kind }: VideoPlayerProps) {
  if (kind === "iframe") {
    return <IframePlayer url={url} title={title} />;
  }
  return <HlsPlayer url={url} title={title} headers={headers} />;
}
