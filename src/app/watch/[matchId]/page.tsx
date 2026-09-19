"use client";

import { useState, useEffect, use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Tv } from "lucide-react";
import VideoPlayer from "@/components/player/VideoPlayer";
import ChannelSelector from "@/components/player/ChannelSelector";
import ChatBox from "@/components/chat/ChatBox";
import LiveBadge from "@/components/matches/LiveBadge";
import { PlayerSkeleton } from "@/components/ui/Skeleton";
import { isLive, isUpcoming, isViewable, isFinished } from "@/lib/utils";
import type { Match, Channel } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { translateLeague } from "@/i18n/dictionaries";

function WatchPageInner({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
  const searchParams = useSearchParams();
  const { t } = useLanguage();
  const [match, setMatch] = useState<Match | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchMatch = async () => {
      setIsLoading(true);
      try {
        const sp = new URLSearchParams(searchParams.toString());
        const qs = sp.toString();
        const url = `/api/matches/${matchId}${qs ? `?${qs}` : ""}`;
        const res = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.match) {
            setMatch(data.match);
            setActiveChannel(data.match.channels[0] ?? null);
          }
        }
      } catch {
        if (!cancelled) { /* Match not found */ }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchMatch();
    return () => { cancelled = true; controller.abort(); };
  }, [matchId, searchParams]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-3 sm:px-4 md:px-6 py-4 sm:py-6">
        <PlayerSkeleton />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="mx-auto max-w-5xl px-3 sm:px-4 md:px-6 py-12 sm:py-20 text-center">
        <div className="text-4xl sm:text-5xl mb-3 sm:mb-4">😕</div>
        <h1 className="text-lg sm:text-xl font-bold text-text-primary">{t.watch.notFound}</h1>
        <p className="mt-2 text-sm text-text-muted">{t.watch.notFoundDesc}</p>
        <Link
          href="/"
          className="bg-accent-primary text-black font-black uppercase px-4 sm:px-5 py-2 sm:py-2.5 border-[3px] border-black shadow-btn transition-all hover:-translate-y-0.5 hover:-translate-x-0.5 hover:shadow-btn-primary-hover mt-4 sm:mt-6 inline-flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
        >
          <ArrowLeft size={14} strokeWidth={3} />
          {t.watch.backHome}
        </Link>
      </div>
    );
  }

  const live = isLive(match.status.short);
  const upcoming = isUpcoming(match.status.short);
  const viewable = isViewable(match.status.short, match.timestamp);
  const finished = isFinished(match.status.short);

  return (
    <div className="mx-auto max-w-7xl px-3 sm:px-4 md:px-6 py-4 sm:py-6" id="watch-page">
      <Link
        href="/"
        className="mb-3 sm:mb-4 inline-flex items-center gap-1.5 sm:gap-2 bg-bg-card text-white text-[10px] sm:text-xs font-black uppercase px-2.5 sm:px-3.5 py-1 sm:py-1.5 border-2 border-white shadow-btn hover:bg-accent-primary hover:text-black hover:border-black transition-all hover:-translate-y-0.5"
        id="watch-back-btn"
      >
        <ArrowLeft size={12} strokeWidth={3} />
        {t.watch.backMatches}
      </Link>

      <div className="flex flex-col md:flex-row gap-4 sm:gap-5">
        {/* Chat — Left on desktop, bottom on mobile */}
        <div className="w-full md:w-80 lg:w-96 shrink-0 md:order-1">
          <div className="md:sticky md:top-24 h-[50vh] md:h-[calc(100vh-8rem)]">
            <ChatBox matchId={matchId} />
          </div>
        </div>

        {/* Player + channels — Right on desktop, top on mobile */}
        <div className="flex-1 min-w-0 md:order-2">
          <div
            className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 bg-accent-primary border-3 sm:border-4 border-black p-3 sm:p-4 shadow-brutal-white"
            id="watch-league-header"
          >
            <div className="flex items-center gap-3 sm:gap-4">
              {match.league.logo ? (
                <div className="relative h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex-shrink-0">
                  <Image
                    src={match.league.logo}
                    alt={match.league.name}
                    fill
                    className="object-contain"
                    sizes="32px"
                  />
                </div>
              ) : (
                <div className="flex h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 flex-shrink-0 items-center justify-center border-2 border-black bg-black text-base sm:text-lg font-black text-accent-primary">
                  ⚽
                </div>
              )}
              <h2 className="text-base sm:text-xl md:text-2xl font-black text-black uppercase tracking-tight">
                {translateLeague(match.league.name)}
              </h2>
            </div>
            {live && <LiveBadge />}
          </div>

          <div className="animate-fade-in">
            {activeChannel ? (
              <VideoPlayer
                url={activeChannel.url}
                title={`${match.homeTeam.name} vs ${match.awayTeam.name}`}
                headers={activeChannel.headers}
                kind={activeChannel.kind}
              />
            ) : (
              <div className="relative w-full aspect-video bg-black overflow-hidden border-3 sm:border-4 border-white shadow-brutal flex flex-col items-center justify-center gap-2 sm:gap-3 p-4 sm:p-6 text-center">
                {finished ? (
                  <>
                    <Tv size={32} strokeWidth={3} className="text-accent-secondary" />
                    <p className="text-base sm:text-lg font-black uppercase text-white">Partido Finalizado</p>
                    <p className="text-[10px] sm:text-xs text-text-muted max-w-xs sm:max-w-md">
                      Este partido terminó ({match.score.home ?? 0} - {match.score.away ?? 0}).
                      Las señales en directo se desactivan una vez finalizado el encuentro.
                    </p>
                  </>
                ) : upcoming && viewable ? (
                  <>
                    <Tv size={24} strokeWidth={3} className="text-accent-primary" />
                    <p className="text-xs sm:text-sm font-medium text-text-primary">{t.watch.previewAvailable}</p>
                    <p className="text-[10px] sm:text-xs text-text-muted">{t.watch.chooseChannelPreview}</p>
                  </>
                ) : upcoming ? (
                  <>
                    <Tv size={24} strokeWidth={3} className="text-text-muted" />
                    <p className="text-xs sm:text-sm text-text-muted">{t.watch.streamAvailableSoon}</p>
                  </>
                ) : (
                  <>
                    <Tv size={24} strokeWidth={3} className="text-accent-primary" />
                    <p className="text-xs sm:text-sm font-black uppercase text-white">{t.watch.noStreams}</p>
                    <p className="text-[10px] sm:text-xs text-text-muted max-w-xs sm:max-w-md">{t.watch.noStreamsDesc}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsLoading(true);
                        const sp = new URLSearchParams(searchParams.toString());
                        sp.set("refresh", "1");
                        const qs = sp.toString();
                        fetch(`/api/matches/${matchId}?${qs}`, { cache: "no-store" })
                          .then((r) => r.json())
                          .then((data) => {
                            if (data.match) {
                              setMatch(data.match);
                              setActiveChannel(data.match.channels[0] ?? null);
                            }
                          })
                          .catch(() => {})
                          .finally(() => setIsLoading(false));
                      }}
                      className="mt-1.5 sm:mt-2 bg-accent-primary text-black font-black uppercase text-[10px] sm:text-xs px-3 sm:px-4 py-1.5 sm:py-2 border-2 border-black shadow-btn hover:-translate-y-0.5 transition-all"
                      id="watch-retry-stream"
                    >
                      {t.watch.retryStream}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {match.channels.length > 0 && (
            <div className="mt-4 sm:mt-5 animate-slide-up" style={{ animationDelay: "0.1s" }}>
              <ChannelSelector
                channels={match.channels}
                activeChannelId={activeChannel?.id ?? ""}
                onChannelChange={setActiveChannel}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function WatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <PlayerSkeleton />
        </div>
      }
    >
      <WatchPageInner params={params} />
    </Suspense>
  );
}
