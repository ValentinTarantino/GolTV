"use client";

import { useEffect, useRef } from "react";
import type { Channel } from "@/lib/types";

export interface IframeChannelBridgeProps {
  channel?: Channel;
  onChannels?: (channels: Channel[]) => void;
}

/** Only copy public signal identifiers; never trust URLs from iframe messages. */
export function parseIframeChannels(value: unknown, url: string): Channel[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 100).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { streamId, siteType, name } = item;
    if (!Number.isSafeInteger(streamId) || streamId <= 0 ||
        !Number.isSafeInteger(siteType) || siteType <= 0) return [];
    const id = `player-two-${siteType}-${streamId}`;
    if (seen.has(id)) return [];
    seen.add(id);
    return [{ id, name: typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : `Canal ${streamId}`,
      url, kind: "iframe" as const, provider: "iframe-bridge" as const, streamId, siteType }];
  });
}

export function useIframeChannelBridge(url: string, { channel, onChannels }: IframeChannelBridgeProps, attempt = 0) {
  const frame = useRef<HTMLIFrameElement>(null);
  const callback = useRef(onChannels);
  const selected = useRef(channel);
  const ready = useRef(false);
  const sent = useRef("");
  useEffect(() => { callback.current = onChannels; selected.current = channel; });
  const enabled = channel?.provider === "iframe-bridge";

  useEffect(() => {
    if (!enabled) return;
    // Relative proxy URLs (/p4/...) resolve against our own origin.
    const origin = new URL(url, window.location.origin).origin;
    const receive = (event: MessageEvent) => {
      if (event.origin !== origin || event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (data?.msgEventType !== "FROM_IFRAME_PLAYER" || data?.val?.evType !== 104) return;
      if (!Array.isArray(data.val._cStreamList)) return;
      const channels = parseIframeChannels(data.val._cStreamList, url);
      ready.current = true;
      callback.current?.(channels);
      const current = selected.current;
      if (current?.streamId && channels.some(c => c.id === current.id)) {
        const key = current.id;
        if (sent.current !== key) {
          frame.current?.contentWindow?.postMessage({ msgEventType: "FROM_PARENT_SITE", val: {
            evType: 104, _si: { streamId: current.streamId, siteType: current.siteType, name: current.name, oriName: current.name },
          } }, origin);
          sent.current = key;
        }
      }
    };
    window.addEventListener("message", receive);
    return () => { window.removeEventListener("message", receive); ready.current = false; sent.current = ""; };
  }, [enabled, url, attempt]);

  useEffect(() => {
    if (!enabled || !ready.current || !channel?.streamId || sent.current === channel.id) return;
    frame.current?.contentWindow?.postMessage({ msgEventType: "FROM_PARENT_SITE", val: {
      evType: 104, _si: { streamId: channel.streamId, siteType: channel.siteType, name: channel.name, oriName: channel.name },
    } }, new URL(url, window.location.origin).origin);
    sent.current = channel.id;
  }, [channel, enabled, url]);
  return frame;
}
