"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Maximize, Pause, Play, RefreshCw, Settings, Volume2, VolumeX } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import FootballLoader from "@/components/ui/FootballLoader";

interface DashPlayerProps {
  url: string;
  title?: string;
  /** ClearKey of an encrypted channel; the browser decrypts CENC with it. */
  clearKey?: { kid: string; key: string } | null;
}

/** Minimal shape of the Shaka player we drive, so the import stays dynamic. */
interface ShakaPlayer {
  attach: (mediaElement: HTMLMediaElement) => Promise<void>;
  load: (uri: string) => Promise<void>;
  destroy: () => Promise<void>;
  unload: () => Promise<void>;
  addEventListener: (name: string, listener: (event: { type: string }) => void) => void;
  getVariantTracks: () => DashVariantTrack[];
  selectVariantTrack: (track: DashVariantTrack, clearBuffer?: boolean) => void;
  configure: {
    (config: Record<string, unknown>): void;
    (path: string, value: unknown): void;
  };
}

interface DashVariantTrack {
  id: number;
  height: number | null;
  bandwidth: number | null;
  active: boolean;
}

function qualityLabel(track: DashVariantTrack): string {
  if (track.height && track.height > 0) return `${track.height}p`;
  if (track.bandwidth && track.bandwidth > 0) return `${(track.bandwidth / 1_000_000).toFixed(1)} Mbps`;
  return `Calidad ${track.id}`;
}
/**
 * DASH player for the "Canales" section.
 *
 * The sports channels of the upstream catalog are MPEG-DASH manifests, so
 * hls.js cannot play them. Shaka Player handles the manifest, the segment
 * requests and the ABR; every request goes through the site relay, which is
 * why the manifest URL is a same-origin `/api/canales/stream` reference.
 */
export default function DashPlayer({ url, title, clearKey }: DashPlayerProps) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<{ destroy: () => Promise<void>; unload: () => Promise<void> } | null>(null);
  /**
   * Teardown of the previous channel. Destroying a Shaka player is async and
   * it detaches the media element when it finishes; if the next channel
   * attaches before that, the old detach leaves the new player without a
   * source. The next channel waits for this promise first.
   */
  const teardownRef = useRef<Promise<void> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [retryToken, setRetryToken] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [qualityTracks, setQualityTracks] = useState<DashVariantTrack[]>([]);
  const [autoQuality, setAutoQuality] = useState(true);
  const [selectedQualityId, setSelectedQualityId] = useState<number | null>(null);
  const [showQualityMenu, setShowQualityMenu] = useState(false);

  useEffect(() => {
    if (!showQualityMenu) return;
    const closeMenu = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowQualityMenu(false);
      }
    };
    document.addEventListener("mousedown", closeMenu);
    return () => document.removeEventListener("mousedown", closeMenu);
  }, [showQualityMenu]);

  useEffect(() => {
    const updateFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    updateFullscreen();
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let instance: ShakaPlayer | null = null;

    setIsLoading(true);
    setHasError(false);
    setQualityTracks([]);
    setAutoQuality(true);
    setSelectedQualityId(null);
    setShowQualityMenu(false);

    (async () => {
      try {
        const shaka = (await import("shaka-player/dist/shaka-player.compiled.js")).default;
        if (cancelled) return;

        // The previous channel must be fully detached before this one attaches
        // to the same <video>, or its late detach kills this stream.
        const pending = teardownRef.current;
        teardownRef.current = null;
        if (pending) await pending.catch(() => {});

        if (cancelled) return;
        if (!shaka.Player.isBrowserSupported()) {
          setHasError(true);
          setIsLoading(false);
          return;
        }

        const player = new shaka.Player();
        instance = player as unknown as ShakaPlayer;
        playerRef.current = player as unknown as { destroy: () => Promise<void>; unload: () => Promise<void> };
        instance.configure({
          streaming: {
            bufferingGoal: 20,
            // A live channel starts as soon as it has a couple of seconds
            // buffered; waiting for four was most of the switch delay.
            rebufferingGoal: 2,
            bufferBehind: 30,
          },
          abr: {
            enabled: true,
          },
        });

        // The player document of the channel ships its ClearKey; with it the
        // browser decrypts the CENC segments without a license server.
        if (clearKey) {
          instance.configure("drm.clearKeys", { [clearKey.kid]: clearKey.key });
        }

        instance.addEventListener("error", (event: { type: string }) => {
          console.warn("[canales] dash player error:", event.type);
          if (cancelled) return;
          setHasError(true);
          setIsLoading(false);
        });

        // Shaka 5 only knows the media element once it is attached.
        await instance.attach(video);
        await instance.load(url);
        // The cleanup of an abandoned run owns the teardown; destroying here
        // as well would race with the next channel.
        if (cancelled) return;

        const tracks = instance.getVariantTracks().filter((track) => track.height || track.bandwidth);
        setQualityTracks(tracks);
        setSelectedQualityId(tracks.find((track) => track.active)?.id ?? null);
        instance.addEventListener("adaptation", () => {
          if (!cancelled) {
            setSelectedQualityId(instance?.getVariantTracks().find((track) => track.active)?.id ?? null);
          }
        });

        setIsLoading(false);
        video.play().catch(() => {});
      } catch (error) {
        console.error("[canales] dash player failed:", error);
        if (!cancelled) {
          setHasError(true);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      const instance = playerRef.current;
      playerRef.current = null;
      if (instance) teardownRef.current = instance.destroy().catch(() => {});
    };
  }, [url, clearKey, retryToken]);
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

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void container.requestFullscreen();
    }
  }, []);

  const selectQuality = useCallback((track: DashVariantTrack | null) => {
    const player = playerRef.current as (ShakaPlayer & { getVariantTracks: () => DashVariantTrack[] }) | null;
    if (!player) return;

    if (!track) {
      player.configure("abr.enabled", true);
      setAutoQuality(true);
      setSelectedQualityId(player.getVariantTracks().find((item) => item.active)?.id ?? null);
    } else {
      player.configure("abr.enabled", false);
      player.selectVariantTrack(track, true);
      setAutoQuality(false);
      setSelectedQualityId(track.id);
    }
    setShowQualityMenu(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-video overflow-hidden bg-black group cursor-pointer ${
        isFullscreen ? "border-0 shadow-none" : "border-3 sm:border-4 border-white shadow-brutal"
      }`}
      onMouseMove={() => setShowControls(true)}
      onClick={togglePlay}
      id="dash-player"
    >
      <video ref={videoRef} className="w-full h-full" playsInline autoPlay />

      <button
        onClick={(e) => {
          e.stopPropagation();
          setRetryToken((n) => n + 1);
        }}
        className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-black/50 text-white/90 transition-colors hover:bg-white/20"
        id="dash-reload"
        title={t.player.reload}
      >
        <RefreshCw size={14} strokeWidth={3} />
      </button>

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-2 sm:gap-3">
            <FootballLoader size={48} />
            <span className="text-xs sm:text-sm text-text-secondary">{t.player.loadingStream}</span>
          </div>
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="flex flex-col items-center gap-2 sm:gap-3 text-center px-4 sm:px-6">
            <AlertCircle size={32} strokeWidth={3} className="text-accent-red" />
            <span className="text-xs sm:text-sm font-medium text-text-primary">{t.player.errorLoading}</span>
            <span className="max-w-xs text-xs font-medium leading-relaxed text-gray-300 sm:max-w-sm sm:text-sm">
              {t.player.tryAnotherChannel}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRetryToken((n) => n + 1);
              }}
              className="mt-1.5 sm:mt-2 bg-accent-primary text-black font-black uppercase text-[10px] sm:text-xs px-3 sm:px-4 py-1.5 sm:py-2 border-2 border-black shadow-btn hover:-translate-y-0.5 transition-all"
              id="dash-retry-btn"
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
            id="dash-play-btn"
          >
            <Play size={20} strokeWidth={3} className="ml-1" />
          </button>
        )}

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between p-2 sm:p-3 md:p-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={togglePlay}
              className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
              id="dash-toggle-play"
            >
              {isPlaying ? <Pause size={14} strokeWidth={3} /> : <Play size={14} strokeWidth={3} />}
            </button>
            <button
              onClick={toggleMute}
              className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
              id="dash-toggle-mute"
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

          <div className="flex items-center gap-1.5 sm:gap-2">
            {qualityTracks.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowQualityMenu((visible) => !visible);
                  }}
                  className="flex h-7 min-w-7 items-center justify-center gap-1 rounded-lg px-1 text-white/90 transition-colors hover:bg-white/10 sm:h-8 sm:min-w-8"
                  id="dash-quality-btn"
                  title={t.player.quality}
                  aria-expanded={showQualityMenu}
                >
                  <Settings size={14} strokeWidth={3} />
                  <span className="hidden text-[10px] font-black uppercase sm:inline">
                    {autoQuality ? t.player.autoQuality : qualityLabel(qualityTracks.find((track) => track.id === selectedQualityId) ?? qualityTracks[0])}
                  </span>
                </button>

                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 z-30 mb-2 w-36 border-2 border-white bg-black/95 py-1 shadow-brutal" onClick={(event) => event.stopPropagation()}>
                    <div className="border-b border-white/20 px-3 py-1 text-[10px] font-black uppercase text-white/50">{t.player.quality}</div>
                    <button type="button" onClick={() => selectQuality(null)} className={`flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase transition-colors hover:bg-white/10 ${autoQuality ? "text-accent-primary" : "text-white"}`}>
                      <span>{t.player.autoQuality}</span>
                      {autoQuality && <Check size={12} strokeWidth={3} />}
                    </button>
                    {[...qualityTracks].sort((a, b) => (b.height ?? 0) - (a.height ?? 0)).map((track) => {
                      const active = !autoQuality && selectedQualityId === track.id;
                      return (
                        <button key={track.id} type="button" onClick={() => selectQuality(track)} className={`flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase transition-colors hover:bg-white/10 ${active ? "text-accent-primary" : "text-white"}`}>
                          <span>{qualityLabel(track)}</span>
                          {active && <Check size={12} strokeWidth={3} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={toggleFullscreen}
              className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg text-white/90 transition-colors hover:bg-white/10"
              id="dash-fullscreen"
            >
              <Maximize size={14} strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
