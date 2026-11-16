"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import VideoPlayer from "@/components/player/VideoPlayer";
import { AlertCircle, ExternalLink, RefreshCw } from "lucide-react";

interface LpfMatch {
  id: string;
  source: "sportplus" | "angulismo" | "demo";
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

/** Public site of the sportplus provider; its player only runs on its own origin. */
const SPORTPLUS_SITE = "https://es.sportplus.watch";

/** The kickoff arrives in Argentina time, so it is rendered as UTC. */
function formatTime(start: string): string {
  if (!start) return "";
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-AR", {
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
        // The demo entry resolves any live football match on the provider,
        // so it is the most reliable thing to auto-play; section matches can
        // be stale entries whose broadcast already ended.
        setActiveId(
          (current) =>
            current ??
            next.find((m) => m.source === "demo" && m.status === "live")?.id ??
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
    const match = matches.find((candidate) => candidate.id === activeId) ?? null;
    let cancelled = false;

    // Sportplus matches render through `externalUrl` below: the provider
    // only serves its playlists to its own site origin and to residential
    // server IPs, so its player has to run on the provider's own page.
    const isExternal =
      match?.source === "demo" || (match?.source === "sportplus" && Boolean(match.viewTid && match.viewMid));
    if (isExternal) return;

    fetch(`/api/lpf/matches/${encodeURIComponent(activeId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { src?: string | null; kind?: "hls" | "iframe" | null }) => {
        if (cancelled) return;
        if (!data.src) {
          setStreamState("error");
          return;
        }
        setStreamSrc(data.src);
        setStreamKind(data.kind ?? "hls");
        setStreamState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStreamState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [activeId, streamReload, matches]);

  const activeMatch = matches.find((match) => match.id === activeId) ?? null;

  // Sportplus matches can not be played from here (see the effect above):
  // they link out to the provider's own player instead.
  const externalUrl = useMemo(() => {
    if (!activeMatch) return null;
    if (activeMatch.source === "sportplus" && activeMatch.viewTid && activeMatch.viewMid) {
      return `${SPORTPLUS_SITE}/football/${activeMatch.viewTid}/${activeMatch.viewMid}/`;
    }
    if (activeMatch.source === "demo") return `${SPORTPLUS_SITE}/football/`;
    return null;
  }, [activeMatch]);

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
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-4 border-white bg-black px-3 py-2 shadow-brutal">
              <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                {copy.nowPlaying}
              </span>
              <span className="truncate text-xs font-black uppercase text-accent-primary sm:text-sm">
                {activeMatch ? `${activeMatch.home} vs ${activeMatch.away}` : copy.noChannel}
              </span>
            </div>

            {externalUrl ? (
              <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 border-3 border-white bg-black px-6 text-center shadow-brutal sm:border-4">
                <ExternalLink size={30} strokeWidth={3} className="text-accent-primary" />
                <span className="text-sm font-black uppercase text-white">{copy.externalTitle}</span>
                <span className="max-w-md text-xs font-medium leading-relaxed text-gray-400">
                  {copy.externalDesc}
                </span>
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-2 border-2 border-black bg-accent-primary px-4 py-2 text-[11px] font-black uppercase text-black shadow-btn transition-transform hover:-translate-y-0.5"
                >
                  <ExternalLink size={14} strokeWidth={3} />
                  {copy.externalCta}
                </a>
              </div>
            ) : streamState === "ready" && streamSrc && activeMatch ? (
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

            <div role="note" className="border-4 border-accent-primary bg-black p-3 shadow-brutal sm:p-4">
              <div className="mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-accent-primary sm:text-xs">
                  {copy.helperTitle}
                </span>
              </div>
              <p className="text-[11px] font-medium leading-relaxed text-gray-300 sm:text-sm">{copy.helperDesc}</p>
            </div>
          </div>

          <aside className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-4 border-white bg-black px-3 py-2 shadow-brutal">
              <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                {copy.matches}
              </span>
              <span className="border-2 border-white bg-accent-primary px-2 py-0.5 text-[10px] font-black text-black">
                {matches.length}
              </span>
            </div>

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
                {list.map((match) => {
                  const isActive = match.id === activeId;
                  return (
                    <button
                      key={match.id}
                      type="button"
                      data-match={match.id}
                      onClick={() => selectMatch(match.id)}
                      title={`${match.home} vs ${match.away}`}
                      className={`flex items-center justify-between gap-2 border-4 px-3 py-2.5 text-left transition-transform hover:-translate-y-0.5 ${
                        isActive
                          ? "border-accent-primary bg-accent-primary text-black shadow-brutal"
                          : "border-white bg-black text-white shadow-brutal"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <TeamCrest src={match.homeLogo} name={match.home} />
                        <span className="text-[10px] font-black uppercase opacity-60">vs</span>
                        <TeamCrest src={match.awayLogo} name={match.away} />
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-[10px] font-bold uppercase opacity-80">{formatTime(match.start)}</span>
                        {match.status === "live" ? (
                          <span className="flex items-center gap-1 text-[9px] font-black uppercase">
                            <span className="h-1.5 w-1.5 rounded-full bg-accent-red animate-pulse" />
                            {copy.live}
                          </span>
                        ) : (
                          <span className="text-[9px] font-black uppercase opacity-70">
                            {statusLabel(match.status)}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </aside>
        </div>
      </section>
    </main>
  );
}
