"use client";

import { useState, useEffect, use } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Tv } from "lucide-react";
import VideoPlayer from "@/components/player/VideoPlayer";
import ChannelSelector from "@/components/player/ChannelSelector";
import LiveBadge from "@/components/matches/LiveBadge";
import { PlayerSkeleton } from "@/components/ui/Skeleton";
import { isLive, isUpcoming, isViewable } from "@/lib/utils";
import type { Match, Channel } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

export default function WatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
  const { t } = useLanguage();
  const [match, setMatch] = useState<Match | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);

  useEffect(() => {
    const fetchMatch = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/matches/${matchId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.match) {
            setMatch(data.match);
            setActiveChannel(data.match.channels[0] ?? null);
          }
        }
      } catch {
        // Match not found
      } finally {
        setIsLoading(false);
      }
    };

    fetchMatch();
  }, [matchId]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <PlayerSkeleton />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-20 text-center">
        <div className="text-5xl mb-4">😕</div>
        <h1 className="text-xl font-bold text-text-primary">{t.watch.notFound}</h1>
        <p className="mt-2 text-sm text-text-muted">
          {t.watch.notFoundDesc}
        </p>
        <Link href="/" className="bg-accent-primary text-black font-black uppercase px-5 py-2.5 border-[3px] border-black shadow-btn transition-all hover:-translate-y-0.5 hover:-translate-x-0.5 hover:shadow-btn-primary-hover mt-6 inline-flex items-center gap-2">
          <ArrowLeft size={16} />
          {t.watch.backHome}
        </Link>
      </div>
    );
  }

  const live = isLive(match.status.short);
  const upcoming = isUpcoming(match.status.short);
  const viewable = isViewable(match.status.short, match.timestamp);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6" id="watch-page">
      {/* Back nav */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-2 bg-bg-card text-white text-xs sm:text-sm font-black uppercase px-3.5 py-1.5 border-2 border-white shadow-btn hover:bg-accent-primary hover:text-black hover:border-black transition-all hover:-translate-y-0.5"
        id="watch-back-btn"
      >
        <ArrowLeft size={16} />
        {t.watch.backMatches}
      </Link>

      {/* Match header */}
      <div
        className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-accent-primary border-4 border-black p-4 shadow-brutal-white"
        id="watch-league-header"
      >
        <div className="flex items-center gap-4">
          <div className="relative h-10 w-10 sm:h-12 sm:w-12 flex-shrink-0">
            <Image
              src={match.league.logo}
              alt={match.league.name}
              fill
              className="object-contain"
              sizes="48px"
            />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-black uppercase tracking-tight">
            {match.league.name}
          </h2>
        </div>
        {live && <LiveBadge />}
      </div>

      {/* Video Player */}
      <div className="animate-fade-in">
        {activeChannel ? (
          <VideoPlayer
            url={activeChannel.url}
            title={`${match.homeTeam.name} vs ${match.awayTeam.name}`}
            headers={activeChannel.headers}
          />
        ) : (
          <div className="relative w-full aspect-video bg-black overflow-hidden border-4 border-white shadow-brutal flex flex-col items-center justify-center gap-3">
            {upcoming && viewable ? (
              <>
                <Tv size={32} className="text-accent-primary" />
                <p className="text-sm font-medium text-text-primary">{t.watch.previewAvailable}</p>
                <p className="text-xs text-text-muted">{t.watch.chooseChannelPreview}</p>
              </>
            ) : upcoming ? (
              <>
                <Tv size={32} className="text-text-muted" />
                <p className="text-sm text-text-muted">{t.watch.streamAvailableSoon}</p>
              </>
            ) : (
              <p className="text-sm text-text-muted">{t.watch.noStreams}</p>
            )}
          </div>
        )}
      </div>

      {/* Channels */}
      {match.channels.length > 0 && (
        <div className="mt-5 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          <ChannelSelector
            channels={match.channels}
            activeChannelId={activeChannel?.id ?? ""}
            onChannelChange={setActiveChannel}
          />
        </div>
      )}
    </div>
  );
}

