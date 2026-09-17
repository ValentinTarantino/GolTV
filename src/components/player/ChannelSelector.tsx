"use client";

import { Radio } from "lucide-react";
import type { Channel } from "@/lib/types";

interface ChannelSelectorProps {
  channels: Channel[];
  activeChannelId: string;
  onChannelChange: (channel: Channel) => void;
}

export default function ChannelSelector({
  channels,
  activeChannelId,
  onChannelChange,
}: ChannelSelectorProps) {
  return (
    <div className="card-static p-4" id="channel-selector">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <Radio size={14} className="text-[var(--accent-primary)]" />
        Canales disponibles
      </h3>
      <div className="flex flex-wrap gap-2">
        {channels.map((channel) => {
          const isActive = channel.id === activeChannelId;
          return (
            <button
              key={channel.id}
              onClick={() => onChannelChange(channel)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
                isActive
                  ? "bg-[var(--accent-primary)] text-white shadow-[var(--shadow-glow-blue)]"
                  : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
              }`}
              id={`channel-${channel.id}`}
            >
              {channel.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
