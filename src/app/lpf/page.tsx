"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VideoPlayer from "@/components/player/VideoPlayer";
import ChatBox from "@/components/chat/ChatBox";
import ViewerBadge from "@/components/matches/ViewerBadge";

interface LpfMatch {
  id: string;
  source: "sportplus" | "angulismo";
  competition: string;
  home: string;
  away: string;
  homeLogo?: string;
  awayLogo?: string;
  start: string;
  status: "live" | "upcoming" | "finished";
  viewTid?: string;
  viewMid?: string;
}

type ListState = "loading" | "ready" | "error";
type StreamState = "loading" | "ready" | "error";

/**
 * Chat/viewer APIs only accept numeric match ids, so the opaque `lpm_…`
 * fixture id is folded into a stable decimal one (first 13 hex digits fit
 * safely in a double).
 */
function chatMatchId(id: string): string {
  const hex = id.replace(/^lpm_/, "").slice(0, 13);
  const n = Number.parseInt(hex, 16);
  return Number.isFinite(n) && n > 0 ? String(n) : "0";
}

/** The kickoff arrives in Argentina time, so it is rendered as UTC. */
function formatTime(start: string): string {
  if (!start) return "";
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Crest of a team; the name is the fallback when the crest is unknown. */
function TeamCrest({ src, name }: { src?: string; name: string }) {
  if (!src) {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center border-2 border-current/40 text-[10px] font-black uppercase">
        {name.slice(0, 2)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      title={name}
      className="h-7 w-7 shrink-0 object-contain"
      loading="lazy"
    />
  );
}

export default function LpfPlayPage() {
  const { t } = useLanguage();
  const copy = t.lpf;

  const [matches, setMatches] = useState<LpfMatch[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [listReload, setListReload] = useState(0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [streamSrc, setStreamSrc] = useState<string | null>(null);
  const [streamKind, setStreamKind] = useState<"hls" | "iframe">("hls");
  const [streamSources, setStreamSources] = useState<string[]>([]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [streamState, setStreamState] = useState<StreamState>("loading");
  const [streamReload, setStreamReload] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/lpf/matches")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { matches?: LpfMatch[] }) => {
        if (cancelled) return;
        const next = Array.isArray(data.matches) ? data.matches : [];
        setMatches(next);
        setListState("ready");
        setActiveId(
          (current) =>
            current ??
            next.find((m) => m.status === "live")?.id ??
            next[0]?.id ??
            null
        );
      })
      .catch(() => {
        if (cancelled) return;
        setMatches([]);
        setListState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [listReload]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;

    fetch(`/api/lpf/matches/${encodeURIComponent(activeId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { src?: string | null; kind?: "hls" | "iframe" | null; sources?: string[] }) => {
        if (cancelled) return;
        if (!data.src) {
          setStreamState("error");
          return;
        }
        setStreamSrc(data.src);
        setStreamKind(data.kind ?? "hls");
        setStreamSources(data.sources ?? []);
        setSourceIndex(0);
        setStreamState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStreamState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [activeId, streamReload]);

  const activeMatch = matches.find((match) => match.id === activeId) ?? null;

  const groups = useMemo(() => {
    const map = new Map<string, LpfMatch[]>();
    for (const match of matches) {
      const list = map.get(match.competition) ?? [];
      list.push(match);
      map.set(match.competition, list);
    }
    return [...map.entries()];
  }, [matches]);

  const reloadStream = useCallback(() => {
    setStreamState("loading");
    setStreamReload((n) => n + 1);
  }, []);

  const reloadList = useCallback(() => {
    setListState("loading");
    setListReload((n) => n + 1);
  }, []);

  const selectMatch = useCallback(
    (id: string) => {
      if (id === activeId) {
        setStreamState("loading");
        setStreamReload((n) => n + 1);
        return;
      }
      setStreamState("loading");
      setActiveId(id);
    },
    [activeId]
  );

  const statusLabel = (status: LpfMatch["status"]) => {
    if (status === "live") return copy.live;
    if (status === "finished") return copy.finished;
    return copy.scheduled;
  };

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-3 py-7 sm:px-4 md:px-6 md:py-10">
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-4 border-white bg-black px-3 py-2 shadow-brutal">
                <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                  {copy.nowPlaying}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  {activeMatch && (
                    <ViewerBadge matchId={chatMatchId(activeMatch.id)} active={activeMatch.status === "live"} />
                  )}
                  <span className="truncate text-xs font-black uppercase text-accent-primary sm:text-sm">
                    {activeMatch ? `${activeMatch.home} vs ${activeMatch.away}` : copy.noChannel}
                  </span>
                </span>
              </div>

            {streamState === "ready" && streamSrc && activeMatch ? (
              <VideoPlayer
                url={streamSrc}
                title={`${activeMatch.home} vs ${activeMatch.away}`}
                kind={streamKind}
                preferFastStart
              />
            ) : (
              <div className="relative flex aspect-video w-full items-center justify-center border-3 border-white bg-black sm:border-4">
                {streamState === "loading" ? (
                  <div className="flex flex-col items-center gap-3 px-6 text-center">
                    <RefreshCw size={26} strokeWidth={3} className="animate-spin text-accent-primary" />
                    <span className="text-xs font-black uppercase tracking-widest text-white sm:text-sm">
                      {copy.loadingStream}
                    </span>
                  </div>
                ) : (
                  <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
                    <AlertCircle size={30} strokeWidth={3} className="text-accent-red" />
                    <span className="text-sm font-black uppercase text-white">{copy.unavailable}</span>
                    <span className="text-xs font-medium leading-relaxed text-gray-400">
                      {copy.unavailableDesc}
                    </span>
                    <button
                      type="button"
                      onClick={reloadStream}
                      className="mt-1 border-2 border-black bg-accent-primary px-3 py-1.5 text-[10px] font-black uppercase text-black shadow-btn transition-transform hover:-translate-y-0.5"
                    >
                      {copy.retry}
                    </button>
                  </div>
                )}
              </div>
            )}
            </div>

            {activeMatch && (
              <div className="h-[380px] min-h-0 sm:h-[480px] lg:h-[560px]">
                <ChatBox matchId={chatMatchId(activeMatch.id)} />
              </div>
            )}

            {streamSources.length > 1 && (
              <div className="flex flex-wrap gap-2 border-4 border-white bg-black px-3 py-2 shadow-brutal">
                <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                  {copy.sources}
                </span>
                {streamSources.map((src, idx) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setSourceIndex(idx)}
                    className={`border-2 px-2 py-1 text-[10px] font-black uppercase transition-transform hover:-translate-y-0.5 ${
                      idx === sourceIndex
                        ? "border-accent-primary bg-accent-primary text-black"
                        : "border-white bg-black text-white"
                    }`}
                  >
                    {idx + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-4 border-white bg-black px-3 py-2 shadow-brutal">
              <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                {copy.matches}
              </span>
              <span className="border-2 border-white bg-accent-primary px-2 py-0.5 text-[10px] font-black text-black">
                {matches.length}
              </span>
            </div>

            <div className="flex flex-col gap-3">

            {listState === "loading" && (
              <p className="border-2 border-white/20 px-3 py-4 text-center text-xs font-bold uppercase text-gray-400">
                {copy.loadingMatches}
              </p>
            )}

            {listState === "error" && (
              <div className="flex flex-col items-center gap-2 border-2 border-accent-red/60 px-3 py-4 text-center">
                <span className="text-xs font-black uppercase text-accent-red">{copy.error}</span>
                <span className="text-[11px] font-medium text-gray-400">{copy.errorDesc}</span>
                <button
                  type="button"
                  onClick={reloadList}
                  className="mt-1 border-2 border-black bg-accent-primary px-3 py-1.5 text-[10px] font-black uppercase text-black shadow-btn transition-transform hover:-translate-y-0.5"
                >
                  {copy.retry}
                </button>
              </div>
            )}

            {listState === "ready" && matches.length === 0 && (
              <div className="flex flex-col items-center gap-2 border-2 border-white/20 px-3 py-4 text-center">
                <span className="text-xs font-black uppercase text-white">{copy.empty}</span>
                <span className="text-[11px] font-medium text-gray-400">{copy.emptyDesc}</span>
              </div>
            )}

            {groups.map(([competition, list]) => (
              <div key={competition} className="flex flex-col gap-2">
                <span className="border-2 border-white/30 bg-black px-3 py-1 text-[10px] font-black uppercase tracking-widest text-accent-primary">
                  {competition}
                </span>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
                  {list.map((match) => {
                    const isActive = match.id === activeId;
                    return (
                      <button
                        key={match.id}
                        type="button"
                        data-match={match.id}
                        onClick={() => selectMatch(match.id)}
                        title={`${match.home} vs ${match.away}`}
                        className={`flex w-full min-w-0 flex-col gap-1.5 border-4 px-2.5 py-2 text-left transition-transform hover:-translate-y-0.5 sm:w-52 sm:shrink-0 sm:px-3 sm:py-2.5 md:w-64 ${
                          isActive
                            ? "border-accent-primary bg-accent-primary text-black shadow-brutal"
                            : "border-white bg-black text-white shadow-brutal"
                        }`}
                      >
                      <span className="flex items-center justify-center gap-2">
                        <TeamCrest src={match.homeLogo} name={match.home} />
                        <span className="text-[9px] font-black uppercase opacity-80 sm:text-[10px]">vs</span>
                        <TeamCrest src={match.awayLogo} name={match.away} />
                      </span>
                      <span className="text-center text-[10px] font-black uppercase leading-tight sm:text-left">
                        {match.home} <span className="opacity-80">vs</span> {match.away}
                      </span>
                      <span className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-bold uppercase sm:text-[10px]">{formatTime(match.start)}</span>
                        {match.status === "live" ? (
                          <span className="flex shrink-0 items-center gap-1 text-[9px] font-black uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent-red animate-pulse" />
                            {copy.live}
                          </span>
                        ) : (
                          <span className="shrink-0 text-[9px] font-black uppercase">
                            {statusLabel(match.status)}
                          </span>
                        )}
                      </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
      </section>

      {listState === "loading" && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 backdrop-blur-sm">
          <RefreshCw size={36} strokeWidth={3} className="animate-spin text-accent-primary" />
          <span className="text-xs font-black uppercase tracking-widest text-white sm:text-sm">
            {copy.loadingMatches}
          </span>
        </div>
      )}
    </main>
  );
}
