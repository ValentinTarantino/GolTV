"use client";

import { useState, useEffect, use } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Share2, Tv } from "lucide-react";
import VideoPlayer from "@/components/player/VideoPlayer";
import ChannelSelector from "@/components/player/ChannelSelector";
import LiveBadge from "@/components/matches/LiveBadge";
import { PlayerSkeleton } from "@/components/ui/Skeleton";
import { isLive, isFinished, isUpcoming, isViewable, formatTime, getStatusLabel } from "@/lib/utils";
import type { Match, Channel } from "@/lib/types";

export default function WatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
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
        <h1 className="text-xl font-bold text-[var(--text-primary)]">Partido no encontrado</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          El partido que buscás no existe o ya no está disponible.
        </p>
        <Link href="/" className="btn-primary mt-6 inline-flex items-center gap-2">
          <ArrowLeft size={16} />
          Volver al inicio
        </Link>
      </div>
    );
  }

  const live = isLive(match.status.short);
  const finished = isFinished(match.status.short);
  const upcoming = isUpcoming(match.status.short);
  const viewable = isViewable(match.status.short, match.timestamp);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6" id="watch-page">
      {/* Back nav */}
      <Link
        href="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--accent-primary)]"
        id="watch-back-btn"
      >
        <ArrowLeft size={16} />
        Volver a partidos
      </Link>

      {/* Match header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <div className="relative h-5 w-5">
            <Image
              src={match.league.logo}
              alt={match.league.name}
              fill
              className="object-contain"
              sizes="20px"
            />
          </div>
          {match.league.name}
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
          <div className="player-container flex flex-col items-center justify-center gap-3">
            {upcoming && viewable ? (
              <>
                <Tv size={32} className="text-[var(--accent-primary)]" />
                <p className="text-sm font-medium text-[var(--text-primary)]">Previa disponible</p>
                <p className="text-xs text-[var(--text-muted)]">Elegí un canal para ver la previa del partido</p>
              </>
            ) : upcoming && match.broadcastChannels && match.broadcastChannels.length > 0 ? (
              <>
                <Tv size={32} className="text-[var(--text-muted)]" />
                <p className="text-sm text-[var(--text-muted)]">El stream estará disponible cuando empiece el partido</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="text-xs text-[var(--text-muted)]">Dónde ver:</span>
                  {match.broadcastChannels.map((ch) => (
                    <span
                      key={ch}
                      className="rounded-full bg-[var(--accent-primary-glow)] px-3 py-1 text-xs font-medium text-[var(--accent-secondary)]"
                    >
                      {ch}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">No hay streams disponibles</p>
            )}
          </div>
        )}
      </div>

      {/* Match Info + Channels */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[1fr_300px]">
        {/* Match Details */}
        <div className="card-static p-5 animate-slide-up" id="match-info">
          <div className="flex items-center justify-between">
            {/* Home Team */}
            <div className="flex flex-col items-center gap-2 flex-1">
              <div className="relative h-16 w-16 sm:h-20 sm:w-20">
                <Image
                  src={match.homeTeam.logo}
                  alt={match.homeTeam.name}
                  fill
                  className="object-contain"
                  sizes="80px"
                />
              </div>
              <span className="text-sm font-semibold text-[var(--text-primary)] text-center">
                {match.homeTeam.name}
              </span>
            </div>

            {/* Score */}
            <div className="flex flex-col items-center gap-2 px-4">
              {(live || finished) ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-4xl font-bold tabular-nums text-[var(--text-primary)]">
                      {match.score.home}
                    </span>
                    <span className="text-xl text-[var(--text-muted)]">-</span>
                    <span className="text-4xl font-bold tabular-nums text-[var(--text-primary)]">
                      {match.score.away}
                    </span>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      live ? "text-[var(--accent-red)]" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {getStatusLabel(match.status.short, match.status.elapsed)}
                    {live && match.status.elapsed && ` ${match.status.elapsed}'`}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-2xl font-bold text-[var(--accent-secondary)]">
                    {formatTime(match.date)}
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">Hora de inicio</span>
                </>
              )}
            </div>

            {/* Away Team */}
            <div className="flex flex-col items-center gap-2 flex-1">
              <div className="relative h-16 w-16 sm:h-20 sm:w-20">
                <Image
                  src={match.awayTeam.logo}
                  alt={match.awayTeam.name}
                  fill
                  className="object-contain"
                  sizes="80px"
                />
              </div>
              <span className="text-sm font-semibold text-[var(--text-primary)] text-center">
                {match.awayTeam.name}
              </span>
            </div>
          </div>

          {/* Status bar */}
          <div className="mt-4 flex items-center justify-center gap-4 border-t border-[var(--border-subtle)] pt-4">
            {upcoming && !viewable && (
              <span className="text-sm text-[var(--accent-secondary)] font-medium">
                ⏳ El partido aún no empezó
              </span>
            )}
            {upcoming && viewable && (
              <span className="text-sm text-[var(--accent-secondary)] font-medium">
                📺 Previa disponible — El partido arranca pronto
              </span>
            )}
            {finished && (
              <span className="text-sm text-[var(--text-muted)]">
                Partido finalizado
              </span>
            )}
            {live && (
              <span className="text-sm text-[var(--accent-red)] font-medium animate-pulse">
                🔴 Transmitiendo en vivo — Totalmente gratis
              </span>
            )}
          </div>

          {/* Broadcast channels for upcoming matches */}
          {upcoming && !viewable && match.broadcastChannels && match.broadcastChannels.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <Tv size={14} className="text-[var(--text-muted)]" />
              <span className="text-xs text-[var(--text-muted)]">Dónde ver:</span>
              {match.broadcastChannels.map((ch) => (
                <span
                  key={ch}
                  className="rounded-full bg-[var(--accent-primary-glow)] px-3 py-1 text-xs font-medium text-[var(--accent-secondary)]"
                >
                  {ch}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Channel Selector */}
        <div className="space-y-4 animate-slide-up" style={{ animationDelay: "0.1s" }}>
          {match.channels.length > 0 && (
            <ChannelSelector
              channels={match.channels}
              activeChannelId={activeChannel?.id ?? ""}
              onChannelChange={setActiveChannel}
            />
          )}

          {/* Share */}
          <div className="card-static p-4">
            <h3 className="mb-2 text-sm font-bold text-[var(--text-primary)]">Compartir</h3>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
                    text: `Mirá ${match.homeTeam.name} vs ${match.awayTeam.name} en vivo gratis en GolTV Libre`,
                    url: window.location.href,
                  });
                } else {
                  navigator.clipboard.writeText(window.location.href);
                }
              }}
              className="btn-ghost w-full flex items-center justify-center gap-2 text-sm"
              id="share-btn"
            >
              <Share2 size={14} />
              Compartir partido
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
