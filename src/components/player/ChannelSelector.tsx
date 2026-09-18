"use client";

import { Radio } from "lucide-react";
import type { Channel } from "@/lib/types";
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { t } = useLanguage();

  return (
    <div className="bg-bg-card border-4 border-white shadow-brutal-sm p-4" id="channel-selector">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-text-primary">
        <Radio size={14} className="text-accent-primary" />
        {t.player.availableChannels}
      </h3>
      {channels.length === 0 ? (
        <p className="text-sm text-text-muted">{t.player.noChannels}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {channels.map((channel) => {
            const isActive = channel.id === activeChannelId;
            return (
              <button
                key={channel.id}
                onClick={() => onChannelChange(channel)}
                className={`px-4 py-2 text-xs sm:text-sm font-black uppercase tracking-wide border-2 transition-all ${
                  isActive
                    ? "bg-accent-primary text-black border-black shadow-btn"
                    : "bg-bg-elevated text-white border-white/40 hover:border-white hover:bg-bg-card-hover"
                }`}
                id={`channel-${channel.id}`}
              >
                {channel.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

