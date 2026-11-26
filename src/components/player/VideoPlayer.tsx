"use client";

import { useRef, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Hls from "hls.js";
import { Play, Pause, Maximize, Volume1, Volume2, VolumeX, AlertCircle, RefreshCw, Settings, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import FootballLoader from "@/components/ui/FootballLoader";
import IframePlayer from "./IframePlayer";
import DashPlayer from "./DashPlayer";
import type { IframeChannelBridgeProps } from "./useIframeChannelBridge";

interface HlsPlayerProps {
  url: string;
  title?: string;
  headers?: Record<string, string>;
  borderlessFullscreen?: boolean;
  /** Starts on the light rendition so the first picture arrives right away. */
  preferFastStart?: boolean;
}

interface QualityLevelInfo {
  index: number;
  height: number;
  bitrate: number;
}

const QUALITY_STORAGE_KEY = "goltv-quality";
const VOLUME_STORAGE_KEY = "goltv-volume";

/** Saved quality preference: -1/auto by default, otherwise a rendition height. */
function readSavedQualityHeight(): number {
  try {
    const raw = localStorage.getItem(QUALITY_STORAGE_KEY);
    if (raw === null) return -1;
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? -1 : parsed;
  } catch {
    return -1;
  }
}

function saveQualityHeight(height: number): void {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, String(height));
  } catch {
    /* ignore */
  }
}

/** Saved volume (0..1). Without a stored value the player starts at full. */
function readSavedVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw === null) return 1;
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) return 1;
    return Math.min(1, Math.max(0, parsed));
  } catch {
    return 1;
  }
}

function saveVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, volume.toFixed(2));
  } catch {
    /* ignore */
  }
}

function levelLabel(level: QualityLevelInfo): string {
  if (level.height > 0) return `${level.height}p`;
  if (level.bitrate > 0) return `${(level.bitrate / 1_000_000).toFixed(1)} Mbps`;
  return `L${level.index + 1}`;
}

function HlsPlayer({
  url,
  title,
  headers,
  borderlessFullscreen = false,
  preferFastStart = false,
}: HlsPlayerProps) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const reloadAttemptsRef = useRef(0);
  const userMutedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [retryToken, setRetryToken] = useState(0);
  const [levels, setLevels] = useState<QualityLevelInfo[]>([]);
  const [activeLevel, setActiveLevel] = useState(-1);
  const [autoLevel, setAutoLevel] = useState(true);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const manualLevelRef = useRef(-1);

  useEffect(() => {
    const updateFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", updateFullscreen);
    updateFullscreen();
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    if (!showQualityMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowQualityMenu(false);
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setShowQualityMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [showQualityMenu]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsLoading(true);
    setHasError(false);
    setLevels([]);
    setActiveLevel(-1);
    setShowQualityMenu(false);
    manualLevelRef.current = -1;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        // The low latency mode asks the origin for the parts of a segment and
        // each of those requests blocks for about a second; on a live edge that
        // is the difference between a picture in one second and a black screen.
        lowLatencyMode: !preferFastStart,
        // Start optimistic so the ABR picks a high rendition on the first manifest
        abrEwmaDefaultEstimate: preferFastStart ? 900_000 : 5_000_000,
        maxBufferLength: 45,
        maxMaxBufferLength: 120,
        // Some live edges answer playlist reloads in 10-20s under load; the
        // hls.js defaults (10s to first byte, 2 retries with no delay) turn
        // that into a fatal levelLoadTimeOut and the player never starts.
        manifestLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 30_000,
            maxLoadTimeMs: 60_000,
            timeoutRetry: { maxNumRetry: 4, retryDelayMs: 1_000, maxRetryDelayMs: 8_000, backoff: "exponential" },
            // HTTP errors on the manifest are mostly "the channel is dead"
            // (the relay answers 503 when the provider published nothing); two
            // quick tries keep a flaky edge recoverable without spinning for a
            // minute on a black frame. The component opens a new session too.
            errorRetry: { maxNumRetry: 2, retryDelayMs: 1_000, maxRetryDelayMs: 2_000, backoff: "exponential" },
          },
        },
        playlistLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 30_000,
            maxLoadTimeMs: 60_000,
            timeoutRetry: { maxNumRetry: 5, retryDelayMs: 1_000, maxRetryDelayMs: 8_000, backoff: "exponential" },
            errorRetry: { maxNumRetry: 5, retryDelayMs: 1_000, maxRetryDelayMs: 8_000, backoff: "exponential" },
          },
        },
        fragLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 30_000,
            maxLoadTimeMs: 120_000,
            timeoutRetry: { maxNumRetry: 6, retryDelayMs: 500, maxRetryDelayMs: 8_000, backoff: "exponential" },
            errorRetry: { maxNumRetry: 6, retryDelayMs: 1_000, maxRetryDelayMs: 8_000, backoff: "exponential" },
          },
        },
        xhrSetup: (xhr) => {
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              xhr.setRequestHeader(key, value);
            });
          }
        },
      });

      const savedHeight = readSavedQualityHeight();
      let mediaErrorRetries = 0;
      let networkErrorRetries = 0;
      // A brand new session usually lands on another edge of the CDN, which is
      // what made a manual reload work; the player now does it on its own.
      reloadAttemptsRef.current = 0;
      // The stream may start with a broken audio frame; the sound is muted
      // until the first picture is on screen.
      video.muted = true;
      // Volume is a user preference and survives channel changes; the element
      // still starts muted until the first picture arrives.
      const savedVolume = readSavedVolume();
      video.volume = savedVolume;

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setIsLoading(false);

        const info: QualityLevelInfo[] = data.levels.map((level, index) => ({
          index,
          height: level.height ?? 0,
          bitrate: level.bitrate ?? 0,
        }));
        setLevels(info);

        // Start at the highest rendition; ABR keeps adapting afterwards
        const topIndex = hls.levels.length - 1;
        if (savedHeight > 0) {
          const savedIndex = info.findIndex((l) => l.height === savedHeight);
          if (savedIndex >= 0) {
            manualLevelRef.current = savedIndex;
            setAutoLevel(false);
            hls.currentLevel = savedIndex;
            setActiveLevel(savedIndex);
          } else {
            hls.startLevel = topIndex;
            setAutoLevel(true);
          }
        } else if (preferFastStart) {
          // The light rendition is a fraction of the size, so the picture
          // shows up in a second instead of after the whole first segment.
          hls.startLevel = 0;
          setAutoLevel(true);
        } else {
          hls.startLevel = topIndex;
          setAutoLevel(true);
        }

        video.play().catch(() => {});
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        setActiveLevel(data.level);
        setAutoLevel(hls.autoLevelEnabled);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;

        // A failed request for the manifest itself is a dead channel: the
        // relay only answers 4xx/503 there when the provider published
        // nothing, so retrying for a minute would just spin on a black frame.
        const isDeadManifest =
          (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
            data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) &&
          typeof data.response?.code === "number" &&
          data.response.code >= 400;
        if (isDeadManifest) {
          setHasError(true);
          setIsLoading(false);
          return;
        }

        // 502/503/504 from the relay are recoverable: the upstream may be
        // temporarily unreachable or cold-starting. Treat them as network errors.
        const isGatewayError =
          data.response?.code &&
          data.response.code >= 500 &&
          data.response.code <= 504;
        const effectiveType = isGatewayError ? Hls.ErrorTypes.NETWORK_ERROR : data.type;

        if (effectiveType === Hls.ErrorTypes.MEDIA_ERROR) {
          // Recoverable: detach/reattach media; swap audio codec if it repeats
          if (hlsRef.current !== hls) return;
          if (mediaErrorRetries >= 3) {
            setHasError(true);
            setIsLoading(false);
            return;
          }
          mediaErrorRetries++;
          if (mediaErrorRetries > 1) hls.swapAudioCodec();
          hls.recoverMediaError();
          return;
        }

        if (effectiveType === Hls.ErrorTypes.NETWORK_ERROR) {
          // Retry with backoff before surfacing the error screen
          if (networkErrorRetries >= 3 || hlsRef.current !== hls) {
            // After the soft retries fail, a whole new session is opened:
            // the CDN rotates its edges and the same source usually answers.
            if (reloadAttemptsRef.current < 2) {
              reloadAttemptsRef.current++;
              setTimeout(() => {
                if (hlsRef.current !== hls) return;
                hls.destroy();
                hlsRef.current = null;
                setRetryToken((n) => n + 1);
              }, 1200 * reloadAttemptsRef.current);
              return;
            }
            setHasError(true);
            setIsLoading(false);
            return;
          }
          networkErrorRetries++;
          setTimeout(() => {
            if (hlsRef.current === hls) hls.startLoad();
          }, 2000 * networkErrorRetries);
          return;
        }

        setHasError(true);
        setIsLoading(false);
      });

      hls.loadSource(url);
      hls.attachMedia(video);

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
  }, [url, headers, retryToken, preferFastStart]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    // The icon follows the element, including the automatic mute that waits
    // for the first picture.
    const onVolumeChange = () => {
      setIsMuted(video.muted || video.volume === 0);
      setVolume(video.volume);
    };
    // The sound comes back once there is a picture to look at.
    const onFirstFrame = () => {
      if (userMutedRef.current) return;
      video.muted = false;
      setIsMuted(false);
    };

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("volumechange", onVolumeChange);
    video.addEventListener("loadeddata", onFirstFrame);
    video.addEventListener("playing", onFirstFrame);
    // The source effect already restored the saved volume, but this listener
    // did not exist yet; a synthetic event brings the slider in sync.
    video.dispatchEvent(new Event("volumechange"));

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("volumechange", onVolumeChange);
      video.removeEventListener("loadeddata", onFirstFrame);
      video.removeEventListener("playing", onFirstFrame);
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
    // Coming back from a full drop to zero restores a usable level, otherwise
    // unmuting would leave the picture silent.
    if (video.muted && video.volume === 0) {
      video.volume = 0.5;
      saveVolume(0.5);
    }
    video.muted = !video.muted;
    userMutedRef.current = video.muted;
    setIsMuted(video.muted);
  };

  const handleVolumeChange = (percent: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.min(1, Math.max(0, percent / 100));
    video.volume = next;
    // Dragging all the way down is the same as muting; any move above zero
    // also lifts a mute the browser applied for autoplay.
    video.muted = next === 0;
    userMutedRef.current = next === 0;
    setVolume(next);
    saveVolume(next);
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

  const selectLevel = (index: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    manualLevelRef.current = index;
    setAutoLevel(index === -1);
    hls.currentLevel = index; // -1 reactiva el ABR automático
    saveQualityHeight(index === -1 ? -1 : levels[index]?.height ?? -1);
    setShowQualityMenu(false);
  };

  const currentQualityLabel = autoLevel
    ? t.player.autoQuality
    : levels.find((level) => level.index === activeLevel)
      ? levelLabel(levels.find((level) => level.index === activeLevel)!)
      : t.player.quality;

  const volumePercent = Math.round(volume * 100);
  const VolumeIcon = isMuted || volumePercent === 0 ? VolumeX : volumePercent < 50 ? Volume1 : Volume2;

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-video overflow-hidden bg-black group cursor-pointer ${
        isFullscreen ? "border-0 shadow-none" : "border-3 sm:border-4 border-white player-plate"
      }${
        borderlessFullscreen ? " player-four-video" : ""
      }`}
      onMouseMove={() => setShowControls(true)}
      onClick={togglePlay}
      id="video-player"
    >
      <video
        ref={videoRef}
        className="h-full w-full"
        playsInline
        autoPlay
      />

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
            <span className="max-w-xs text-xs font-medium leading-relaxed text-gray-300 sm:max-w-sm sm:text-sm">{t.player.tryAnotherChannel}</span>
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
              aria-label={isMuted ? t.player.unmute : t.player.mute}
              title={isMuted ? t.player.unmute : t.player.mute}
            >
              <VolumeIcon size={14} strokeWidth={3} />
            </button>

            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={volumePercent}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="volume-slider ml-0.5"
              style={{ "--volume-fill": `${volumePercent}%` } as CSSProperties}
              id="player-volume"
              aria-label={t.player.volume}
              title={`${t.player.volume}: ${volumePercent}%`}
            />

            {isPlaying && (
              <div className="ml-1 sm:ml-2 flex items-center gap-1 sm:gap-1.5">
                <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-accent-red animate-pulse" />
                <span className="text-[10px] sm:text-xs font-semibold text-white/80">{t.player.live}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {levels.length > 0 && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQualityMenu((v) => !v);
                  }}
                  className="flex h-7 min-w-7 sm:h-8 sm:min-w-8 items-center justify-center gap-1 rounded-lg px-1 text-white/90 transition-colors hover:bg-white/10"
                  id="player-quality-btn"
                  title={t.player.quality}
                  aria-label={`${t.player.quality}: ${currentQualityLabel}`}
                  aria-expanded={showQualityMenu}
                >
                  <Settings size={14} strokeWidth={3} />
                  <span className="hidden text-[10px] font-black uppercase sm:inline">{currentQualityLabel}</span>
                </button>

                {showQualityMenu && (
                  <div
                    className="absolute bottom-full right-0 mb-2 w-36 bg-black/95 border-2 border-white shadow-brutal z-30 py-1"
                    id="player-quality-menu"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="px-3 py-1 text-[10px] font-black uppercase text-white/50 border-b border-white/20">
                      {t.player.quality}
                    </div>
                    <button
                      onClick={() => selectLevel(-1)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase transition-colors hover:bg-white/10 ${
                        autoLevel ? "text-accent-primary" : "text-white"
                      }`}
                      id="player-quality-auto"
                    >
                      <span>{t.player.autoQuality}</span>
                      {autoLevel && <Check size={12} strokeWidth={3} />}
                    </button>
                    {[...levels]
                      .sort((a, b) => b.height - a.height)
                      .map((level) => {
                        const isActive = !autoLevel && activeLevel === level.index;
                        return (
                          <button
                            key={level.index}
                            onClick={() => selectLevel(level.index)}
                            className={`w-full flex items-center justify-between px-3 py-1.5 text-[11px] font-bold uppercase transition-colors hover:bg-white/10 ${
                              isActive ? "text-accent-primary" : "text-white"
                            }`}
                            id={`player-quality-${level.height > 0 ? `${level.height}p` : level.index}`}
                          >
                            <span>{levelLabel(level)}</span>
                            {isActive && <Check size={12} strokeWidth={3} />}
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
              id="player-fullscreen"
            >
              <Maximize size={14} strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
interface VideoPlayerProps extends IframeChannelBridgeProps {
  url: string;
  title?: string;
  headers?: Record<string, string>;
  kind?: "hls" | "dash" | "iframe";
  borderlessFullscreen?: boolean;
  /** ClearKey material for encrypted DASH channels. */
  clearKey?: { kid: string; key: string } | null;
  /** Starts on the light rendition so the first picture arrives right away. */
  preferFastStart?: boolean;
}

export default function VideoPlayer({ url, title, headers, kind, borderlessFullscreen, channel, onChannels, clearKey, preferFastStart }: VideoPlayerProps) {
  if (kind === "iframe") {
    return <IframePlayer url={url} title={title} channel={channel} onChannels={onChannels} />;
  }
  if (kind === "dash") {
    return <DashPlayer url={url} title={title} clearKey={clearKey ?? null} />;
  }
  return (
    <HlsPlayer
      url={url}
      title={title}
      headers={headers}
      borderlessFullscreen={borderlessFullscreen}
      preferFastStart={preferFastStart}
    />
  );
}

