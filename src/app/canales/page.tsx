"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VideoPlayer from "@/components/player/VideoPlayer";

interface CanalChannel {
  id: string;
  label: string;
  group: "lpf" | "sports";
}

interface CanalClearKey {
  kid: string;
  key: string;
}

type ListState = "loading" | "ready" | "error";
type StreamState = "loading" | "ready" | "error";

export default function CanalesPage() {
  const { t } = useLanguage();
  const copy = t.canales;

  const [channels, setChannels] = useState<CanalChannel[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [listReload, setListReload] = useState(0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [streamSrc, setStreamSrc] = useState<string | null>(null);
  const [streamKind, setStreamKind] = useState<"hls" | "dash" | "iframe">("hls");
  const [clearKey, setClearKey] = useState<CanalClearKey | null>(null);
  const [streamState, setStreamState] = useState<StreamState>("loading");
  const [streamReload, setStreamReload] = useState(0);
  const prefetchedRef = useRef<Set<string>>(new Set());

  /**
   * Warms the server cache for a channel before the visitor clicks it. The
   * first resolution of a channel has to fetch its post and decrypt the
   * player, which takes a few seconds; doing it on hover makes the click
   * start playing right away.
   */
  const prefetchChannel = useCallback((id: string) => {
    if (prefetchedRef.current.has(id)) return;
    prefetchedRef.current.add(id);
    fetch(`/api/canales/${encodeURIComponent(id)}`).catch(() => {
      prefetchedRef.current.delete(id);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/canales")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { channels?: CanalChannel[] }) => {
        if (cancelled) return;
        const next = Array.isArray(data.channels) ? data.channels : [];
        setChannels(next);
        setListState("ready");
        setActiveId((current) => current ?? next[0]?.id ?? null);
        // Warm the channel that opens the section.
        if (next[0]) prefetchChannel(next[0].id);
      })
      .catch(() => {
        if (cancelled) return;
        setChannels([]);
        setListState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [listReload, prefetchChannel]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;

    const resolve = async (attempt: number) => {
      try {
        const res = await fetch(`/api/canales/${encodeURIComponent(activeId)}`);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          src?: string | null;
          kind?: "hls" | "dash" | "iframe" | null;
          clearKey?: CanalClearKey | null;
        };
        if (cancelled) return;
        if (!data.src) {
          setStreamState("error");
          return;
        }
        setStreamSrc(data.src);
        setStreamKind(data.kind ?? "hls");
        setClearKey(data.clearKey ?? null);
        setStreamState("ready");
      } catch {
        if (cancelled) return;
        // The first attempt can hit a cold upstream; one more try before
        // telling the visitor the channel is down.
        if (attempt < 2) {
          setStreamState("loading");
          await new Promise((r) => setTimeout(r, 1200));
          if (!cancelled) await resolve(attempt + 1);
          return;
        }
        setStreamState("error");
      }
    };

    void resolve(0);

    return () => {
      cancelled = true;
    };
  }, [activeId, streamReload]);

  const activeChannel = channels.find((channel) => channel.id === activeId) ?? null;

  const groups = useMemo(() => {
    const sports = channels.filter((channel) => channel.group === "sports");
    
    // Organize sports channels by category for better navigation
    const espn = sports.filter((c) => c.label.toLowerCase().includes("espn"));
    const fox = sports.filter((c) => c.label.toLowerCase().includes("fox"));
    const tnt = sports.filter((c) => c.label.toLowerCase().includes("tnt"));
    const tyc = sports.filter((c) => c.label.toLowerCase().includes("tyc"));
    const other = sports.filter((c) => 
      !c.label.toLowerCase().includes("espn") &&
      !c.label.toLowerCase().includes("fox") &&
      !c.label.toLowerCase().includes("tnt") &&
      !c.label.toLowerCase().includes("tyc")
    );
    
    return { espn, other, tyc, fox, tnt };
  }, [channels]);

  const reloadStream = useCallback(() => {
    setStreamState("loading");
    setStreamSrc(null);
    setStreamReload((n) => n + 1);
  }, []);

  const reloadList = useCallback(() => {
    setListState("loading");
    setListReload((n) => n + 1);
  }, []);

  const selectChannel = useCallback(
    (id: string) => {
      prefetchChannel(id);
      if (id === activeId) {
        setStreamState("loading");
        setStreamReload((n) => n + 1);
        return;
      }
      // The current frame stays on screen while the new channel resolves, so
      // the section never flashes black on a switch.
      setStreamState("loading");
      setActiveId(id);
    },
    [activeId, prefetchChannel]
  );

  const renderChannelButton = (channel: CanalChannel) => {
    const isActive = channel.id === activeId;
    return (
      <button
        key={channel.id}
        type="button"
        onClick={() => selectChannel(channel.id)}
        onMouseEnter={() => prefetchChannel(channel.id)}
        onFocus={() => prefetchChannel(channel.id)}
        className={`inline-flex w-full min-w-0 items-center justify-between gap-1 border-2 px-2 py-2 text-left transition-transform hover:-translate-y-0.5 ${
          isActive
            ? "border-accent-primary bg-accent-primary text-black shadow-brutal"
            : "border-white bg-black text-white shadow-brutal"
        }`}
        data-canal={channel.id}
      >
        <span className="text-[11px] font-black uppercase leading-tight tracking-wide sm:text-xs">{channel.label}</span>
        {isActive ? (
          <span className="flex items-center gap-1 text-[9px] font-black uppercase">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-red animate-pulse" />
            {copy.live}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-7xl px-3 py-7 sm:px-4 md:px-6 md:py-10">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-4 border-white bg-black px-3 py-2 shadow-brutal">
              <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                {copy.nowPlaying}
              </span>
              <span className="truncate text-xs font-black uppercase text-accent-primary sm:text-sm">
                {activeChannel?.label ?? copy.noChannel}
              </span>
            </div>

            {streamSrc && activeChannel ? (
              <div className="relative">
                <VideoPlayer
                  url={streamSrc}
                  title={activeChannel.label}
                  kind={streamKind}
                  clearKey={streamKind === "dash" ? clearKey : null}
                  preferFastStart
                  cropBottom={0.075}
                />
                {streamState === "loading" ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                    <div className="flex flex-col items-center gap-3 px-6 text-center">
                      <RefreshCw size={26} strokeWidth={3} className="animate-spin text-accent-primary" />
                      <span className="text-xs font-black uppercase tracking-widest text-white sm:text-sm">
                        {copy.loadingStream}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
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
                  <div className="flex max-w-sm flex-col flex-col items-center gap-3 px-6 text-center">
                    <AlertCircle size={30} strokeWidth={3} className="text-accent-red" />
                    <span className="text-sm font-black uppercase text-white">{copy.unavailable}</span>
                    <span className="text-xs font-medium leading-relaxed text-gray-400">
                      {copy.unavailableDesc}
                    </span>
                    <button
                      type="button"
                      onClick={reloadStream}
                      className="mt-1 border-2 border-black bg-accent-primary px-3 py-1.5 text-[10px] font-black uppercase text-black shadow-btn transition-transform hover:-translate-y-0.5 sm:text-xs"
                    >
                      {copy.retry}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div
              role="note"
              className="border-4 border-accent-primary bg-black p-3 shadow-brutal sm:p-4"
            >
              <div className="mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-accent-primary sm:text-xs">
                  {copy.helperTitle}
                </span>
              </div>
              <p className="text-[11px] font-medium leading-relaxed text-gray-300 sm:text-sm">
                {copy.helperDesc}
              </p>
            </div>
          </div>

          <aside className="flex flex-col gap-3">
            <div className="flex items-center justify-between border-4 border-white bg-black px-3 py-2 shadow-brutal">
              <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                {copy.channels}
              </span>
              <span className="border-2 border-white bg-accent-primary px-2 py-0.5 text-[10px] font-black text-black">
                {channels.length}
              </span>
            </div>

            {listState === "loading" && (
              <p className="border-2 border-white/20 px-3 py-4 text-center text-xs font-bold uppercase text-gray-400">
                {copy.loading}
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

            {listState === "ready" && channels.length === 0 && (
              <div className="flex flex-col items-center gap-2 border-2 border-white/20 px-3 py-4 text-center">
                <span className="text-xs font-black uppercase text-white">{copy.empty}</span>
                <span className="text-[11px] font-medium text-gray-400">{copy.emptyDesc}</span>
              </div>
            )}

            <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {groups.espn.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="w-full border-2 border-red-500 bg-black px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-red-500">
                    ESPN
                  </span>
                  <div className="flex flex-col items-stretch gap-2">
                    {groups.espn.map(renderChannelButton)}
                  </div>
                </div>
              )}
  
              {groups.other.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="w-full border-2 border-accent-primary bg-black px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-accent-primary">
                    Otros
                  </span>
                  <div className="flex flex-col items-stretch gap-2">
                    {groups.other.map(renderChannelButton)}
                  </div>
                </div>
              )}

              {groups.tyc.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="w-full border-2 border-green-500 bg-black px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-green-500">
                    TyC Sports
                  </span>
                  <div className="flex flex-col items-stretch gap-2">
                    {groups.tyc.map(renderChannelButton)}
                  </div>
                </div>
              )}

              {groups.fox.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="w-full border-2 border-blue-500 bg-black px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-blue-500">
                    FOX Sports
                  </span>
                  <div className="flex flex-col items-stretch gap-2">
                    {groups.fox.map(renderChannelButton)}
                  </div>
                </div>
              )}

              {groups.tnt.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="w-full border-2 border-purple-500 bg-black px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-purple-500">
                    TNT Sports
                  </span>
                  <div className="flex flex-col items-stretch gap-2">
                    {groups.tnt.map(renderChannelButton)}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
