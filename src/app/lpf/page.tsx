"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Lightbulb, Radio, RefreshCw, Signal } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import VideoPlayer from "@/components/player/VideoPlayer";

interface LpfChannel {
  id: string;
  label: string;
  number: number;
}

type ListState = "loading" | "ready" | "error";
type StreamState = "loading" | "ready" | "error";

export default function LpfPlayPage() {
  const { t } = useLanguage();
  const copy = t.lpf;

  const [channels, setChannels] = useState<LpfChannel[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [listReload, setListReload] = useState(0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [streamSrc, setStreamSrc] = useState<string | null>(null);
  const [streamState, setStreamState] = useState<StreamState>("loading");
  const [streamReload, setStreamReload] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/lpf")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { channels?: LpfChannel[] }) => {
        if (cancelled) return;
        const next = Array.isArray(data.channels) ? data.channels : [];
        setChannels(next);
        setListState("ready");
        setActiveId((current) => current ?? next[0]?.id ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setChannels([]);
        setListState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [listReload]);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;

    fetch(`/api/lpf/${encodeURIComponent(activeId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { src?: string }) => {
        if (cancelled) return;
        if (!data.src) {
          setStreamState("error");
          return;
        }
        setStreamSrc(data.src);
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

  const activeChannel = channels.find((channel) => channel.id === activeId) ?? null;

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
      if (id === activeId) {
        setStreamState("loading");
        setStreamSrc(null);
        setStreamReload((n) => n + 1);
        return;
      }
      setStreamState("loading");
      setStreamSrc(null);
      setActiveId(id);
    },
    [activeId]
  );

  return (
    <main className="min-h-screen">
      <section className="border-b-4 border-white bg-black/90 shadow-[0_6px_0_0_var(--color-accent-secondary)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-6 sm:px-4 md:px-6 md:py-8">
          <div className="flex items-center gap-2 text-accent-primary">
            <Radio size={18} strokeWidth={3} />
            <span className="text-[10px] font-black uppercase tracking-[0.25em] sm:text-xs">
              {copy.badge}
            </span>
          </div>
          <h1 className="text-3xl font-black uppercase leading-none tracking-tight text-white sm:text-5xl">
            {copy.title}
          </h1>
          <p className="max-w-2xl text-xs font-bold uppercase leading-relaxed text-gray-400 sm:text-sm">
            {copy.subtitle}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-3 py-7 sm:px-4 md:px-6 md:py-10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-4 border-white bg-black px-3 py-2 shadow-brutal">
              <div className="flex items-center gap-2">
                <Signal size={14} strokeWidth={3} className="text-accent-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-white sm:text-xs">
                  {copy.nowPlaying}
                </span>
              </div>
              <span className="truncate text-xs font-black uppercase text-accent-primary sm:text-sm">
                {activeChannel?.label ?? copy.noChannel}
              </span>
            </div>

            {streamState === "ready" && streamSrc && activeChannel ? (
              <VideoPlayer url={streamSrc} title={activeChannel.label} />
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
              <div className="mb-1.5 flex items-center gap-2">
                <Lightbulb size={15} strokeWidth={3} className="shrink-0 text-accent-primary" />
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

            {channels.map((channel) => {
              const isActive = channel.id === activeId;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => selectChannel(channel.id)}
                  className={`flex items-center justify-between gap-2 border-4 px-3 py-2.5 text-left transition-transform hover:-translate-y-0.5 ${
                    isActive
                      ? "border-accent-primary bg-accent-primary text-black shadow-brutal"
                      : "border-white bg-black text-white shadow-brutal"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Radio size={14} strokeWidth={3} className={isActive ? "text-black" : "text-accent-primary"} />
                    <span className="text-xs font-black uppercase tracking-wide sm:text-sm">
                      {channel.label}
                    </span>
                  </span>
                  {isActive ? (
                    <span className="flex items-center gap-1 text-[9px] font-black uppercase">
                      <span className="h-1.5 w-1.5 rounded-full bg-accent-red animate-pulse" />
                      {copy.live}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </aside>
        </div>
      </section>
    </main>
  );
}
