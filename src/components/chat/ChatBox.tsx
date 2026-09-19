"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Send } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ChatMessage } from "@/lib/chat";

interface ChatBoxProps {
  matchId: string;
}

const NICK_KEY = "goltv-chat-nick";
const POLL_INTERVAL = 3000;

export default function ChatBox({ matchId }: ChatBoxProps) {
  const { t } = useLanguage();
  const [nick, setNick] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(NICK_KEY);
  });
  const [nickInput, setNickInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/chat?matchId=${matchId}&offset=${offsetRef.current}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.messages?.length) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = data.messages.filter(
            (m: ChatMessage) => !existingIds.has(m.id)
          );
          if (newMsgs.length) {
            offsetRef.current = newMsgs[newMsgs.length - 1].ts;
            return [...prev, ...newMsgs];
          }
          return prev;
        });
      }
    } catch {
      // silently ignore
    }
  }, [matchId]);

  useEffect(() => {
    if (!nick) return;

    fetchMessages();
    pollRef.current = setInterval(fetchMessages, POLL_INTERVAL);

    const handleVisibility = () => {
      if (document.hidden) {
        if (pollRef.current) clearInterval(pollRef.current);
      } else {
        fetchMessages();
        pollRef.current = setInterval(fetchMessages, POLL_INTERVAL);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [nick, fetchMessages]);

  const handleEnterNick = () => {
    const trimmed = nickInput.trim();
    if (!trimmed) return;
    localStorage.setItem(NICK_KEY, trimmed);
    setNick(trimmed);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !nick) return;

    setError(null);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, nick, text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "Rate limited" ? "Esperá unos segundos..." : "Error al enviar");
        setInput(text);
      }
    } catch {
      setError("Error de conexión");
      setInput(text);
    }
  };

  if (!nick) {
    return (
      <div className="flex flex-col h-full bg-black border-4 border-white shadow-brutal">
        <div className="flex items-center gap-2 px-4 py-3 bg-white text-black border-b-4 border-white">
          <MessageSquare size={16} strokeWidth={3} />
          <span className="text-sm font-black uppercase tracking-wider">{t.chat.title}</span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <p className="text-sm font-bold text-white text-center">{t.chat.nickPrompt}</p>
          <input
            type="text"
            value={nickInput}
            onChange={(e) => setNickInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleEnterNick()}
            maxLength={20}
            placeholder={t.chat.nickPlaceholder}
            className="w-full max-w-[200px] px-3 py-2 bg-black text-white border-2 border-white text-sm font-bold text-center focus:border-accent-primary focus:outline-none"
          />
          <button
            onClick={handleEnterNick}
            className="px-4 py-2 bg-accent-primary text-black text-xs font-black uppercase border-2 border-black shadow-btn hover:-translate-y-0.5 transition-all"
          >
            {t.chat.enterButton}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-black border-4 border-white shadow-brutal">
      <div className="flex items-center justify-between px-4 py-3 bg-white text-black border-b-4 border-white">
        <div className="flex items-center gap-2">
          <MessageSquare size={16} strokeWidth={3} />
          <span className="text-sm font-black uppercase tracking-wider">{t.chat.title}</span>
        </div>
        <span className="text-[10px] font-bold opacity-60">@{nick}</span>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2 min-h-0 break-words">
        {messages.length === 0 ? (
          <p className="text-xs text-text-muted text-center mt-8">{t.chat.messagesEmpty}</p>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`text-xs leading-relaxed break-words ${msg.nick === nick ? "text-accent-primary" : "text-white"}`}
            >
              <span className="font-black">{msg.nick}: </span>
              <span>{msg.text}</span>
            </div>
          ))
        )}
      </div>

      {error && (
        <div className="px-3 py-1 text-[10px] font-bold text-accent-red text-center">{error}</div>
      )}

      <div className="flex gap-2 p-3 border-t-4 border-white">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          maxLength={500}
          placeholder={t.chat.placeholder}
          className="flex-1 px-3 py-2 bg-black text-white border-2 border-white/40 text-xs font-bold focus:border-accent-primary focus:outline-none min-w-0"
        />
        <button
          onClick={handleSend}
          className="flex items-center justify-center h-9 w-9 bg-accent-primary text-black border-2 border-black shrink-0 hover:-translate-y-0.5 transition-all"
        >
          <Send size={14} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
