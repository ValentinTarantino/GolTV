"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Pencil, Send } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { DEFAULT_CHAT_COLORS, isChatColor, isChatPaletteColor, type ChatColors } from "@/lib/chat-colors";
import ChatColorSelect from "./ChatColorSelect";
import type { ChatMessage } from "@/lib/chat";

interface ChatBoxProps {
  matchId: string;
}

const NICK_KEY = "goltv-chat-nick";
const NICK_COLOR_KEY = "goltv-chat-nick-color";
const TEXT_COLOR_KEY = "goltv-chat-text-color";
const POLL_INTERVAL = 3000;

function readPreference(key: string): string | null {
  try { return typeof window === "undefined" ? null : localStorage.getItem(key); }
  catch { return null; }
}

function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); }
  catch { /* Preferences still work for the current session. */ }
}

export default function ChatBox({ matchId }: ChatBoxProps) {
  return <ChatSession key={matchId} matchId={matchId} />;
}

function ChatSession({ matchId }: ChatBoxProps) {
  const { t } = useLanguage();
  const [nick, setNick] = useState<string | null>(() => readPreference(NICK_KEY));
  const [colors, setColors] = useState<ChatColors>(() => {
    const nickColor = readPreference(NICK_COLOR_KEY);
    const textColor = readPreference(TEXT_COLOR_KEY);
    return {
      nickColor: isChatPaletteColor(nickColor) ? nickColor.toLowerCase() : DEFAULT_CHAT_COLORS.nickColor,
      textColor: isChatPaletteColor(textColor) ? textColor.toLowerCase() : DEFAULT_CHAT_COLORS.textColor,
    };
  });
  const [nickInput, setNickInput] = useState("");
  const [editingNick, setEditingNick] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const offsetRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nickInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingNick) {
      nickInputRef.current?.focus();
      nickInputRef.current?.select();
    }
  }, [editingNick]);

  const isNearBottom = () => {
    const el = scrollRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  };

  const scrollToBottom = () => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  };

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat?matchId=${matchId}&offset=${offsetRef.current}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 503 ? t.chat.storageUnavailable : t.chat.loadError);
        return;
      }
      setPersistent(data.persistent !== false);
      setError(null);
      if (data.messages?.length) {
        setMessages(prev => {
          const ids = new Set(prev.map(message => message.id));
          const incoming = data.messages.filter((message: ChatMessage) => !ids.has(message.id));
          if (!incoming.length) return prev;
          offsetRef.current = incoming[incoming.length - 1].ts;
          return [...prev, ...incoming];
        });
      }
    } catch {
      setError(t.chat.loadError);
    }
  }, [matchId, t.chat.loadError, t.chat.storageUnavailable]);

  useEffect(() => {
    // Reading is public; a nickname is required only when sending.
    let poll: ReturnType<typeof setInterval> | undefined;
    const stop = () => { if (poll) clearInterval(poll); poll = undefined; };
    const start = () => {
      stop();
      void fetchMessages();
      if (!document.hidden) poll = setInterval(fetchMessages, POLL_INTERVAL);
    };
    const initialFetch = window.setTimeout(start, 0);
    const handleVisibility = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearTimeout(initialFetch);
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchMessages]);

  useEffect(() => {
    if (messages.length && isNearBottom()) scrollToBottom();
  }, [messages.length]);

  const handleEnterNick = () => {
    const trimmed = nickInput.trim();
    if (!/^[a-zA-Z0-9 _-]{1,20}$/.test(trimmed)) {
      setError(t.chat.invalidNick);
      return;
    }
    savePreference(NICK_KEY, trimmed);
    setNick(trimmed);
    setEditingNick(false);
    setError(null);
  };

  const changeColor = (field: keyof ChatColors, value: string) => {
    if (!isChatPaletteColor(value)) return;
    setColors(previous => ({ ...previous, [field]: value }));
    savePreference(field === "nickColor" ? NICK_COLOR_KEY : TEXT_COLOR_KEY, value);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || !nick || sending || editingNick) return;
    setSending(true);
    setError(null);
    setInput("");
    scrollToBottom();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, nick, text, ...colors }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "Rate limited" ? t.chat.rateLimit
          : res.status === 503 ? t.chat.storageUnavailable : t.chat.sendError);
        setInput(text);
      } else {
        setPersistent(data.persistent !== false);
        await fetchMessages();
      }
    } catch {
      setError(t.chat.sendError);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-col h-full bg-black border-4 border-white shadow-brutal">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3 bg-white text-black border-b-4 border-white">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare size={16} strokeWidth={3} className="shrink-0" />
          <span className="truncate text-sm font-black uppercase tracking-wider">{t.chat.title}</span>
        </div>
        {nick && <button type="button" aria-label={t.chat.changeNick} title={t.chat.changeNick} disabled={sending}
          onClick={() => { setNickInput(nick); setEditingNick(true); setError(null); }}
          className="max-w-[45%] shrink-0 text-right text-black hover:text-black/70 disabled:opacity-50">
          <span className="block truncate text-xs font-bold">@{nick}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold underline underline-offset-2">
            <Pencil size={10} />{t.chat.changeNick}
          </span>
        </button>}
      </div>

      <div ref={scrollRef} role="log" aria-label={t.chat.title} aria-live="polite" aria-relevant="additions text"
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2 min-h-0 break-words">
        {persistent === false && (
          <p role="status" className="border-2 border-accent-primary bg-accent-primary/10 px-2 py-1.5 text-[10px] font-bold text-accent-primary">
            {t.chat.temporaryStorageWarning}
          </p>
        )}
        {messages.length === 0 ? (
          <p className="text-xs text-text-muted text-center mt-8">{t.chat.messagesEmpty}</p>
        ) : messages.map(message => {
          const own = message.nick === nick;
          const defaultColor = own ? DEFAULT_CHAT_COLORS.nickColor : DEFAULT_CHAT_COLORS.textColor;
          return (
            <div key={message.id} className="text-sm leading-relaxed break-words">
              <span className="font-black" style={{ color: isChatColor(message.nickColor) ? message.nickColor : defaultColor }}>{message.nick}: </span>
              <span style={{ color: isChatColor(message.textColor) ? message.textColor : defaultColor }}>{message.text}</span>
            </div>
          );
        })}
      </div>

      {error && <div role="alert" className="shrink-0 px-3 py-1 text-[10px] font-bold text-accent-red text-center">{error}</div>}

      <div className="grid shrink-0 grid-cols-2 gap-3 border-t-2 border-white/30 px-3 py-2">
        {(["nickColor", "textColor"] as const).map(field => (
          <ChatColorSelect key={field} label={t.chat[field]} value={colors[field]} alignEnd={field === "textColor"}
            onChange={color => changeColor(field, color)} />
        ))}
      </div>

      {nick && !editingNick ? (
        <form onSubmit={event => { event.preventDefault(); void handleSend(); }} className="flex shrink-0 gap-2 p-3 border-t-4 border-white">
          <input type="text" value={input} onChange={event => setInput(event.target.value)}
            maxLength={500} placeholder={t.chat.placeholder} aria-label={t.chat.placeholder} disabled={sending}
            style={{ color: colors.textColor }}
            className="flex-1 px-3 py-2 bg-black border-2 border-white/40 text-sm font-bold focus:border-accent-primary focus:outline-none min-w-0" />
          <button type="submit" aria-label={t.chat.sendButton} title={t.chat.sendButton} disabled={sending || !input.trim()}
            className="flex items-center justify-center h-9 w-9 bg-accent-primary text-black border-2 border-black shrink-0 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <Send size={14} strokeWidth={3} />
          </button>
        </form>
      ) : (
        <form onSubmit={event => { event.preventDefault(); handleEnterNick(); }} className="shrink-0 border-t-4 border-white p-3">
          <p className="mb-2 text-[11px] font-medium leading-relaxed text-gray-300">{editingNick ? t.chat.changeNick : t.chat.readOnlyNotice}</p>
          <div className="flex gap-2">
            <input ref={nickInputRef} type="text" value={nickInput} onChange={event => setNickInput(event.target.value)}
              maxLength={20} placeholder={t.chat.nickPlaceholder} aria-label={t.chat.nickPlaceholder}
              style={{ color: colors.nickColor }}
              className="min-w-0 flex-1 border-2 border-white/40 bg-black px-3 py-2 text-sm font-bold focus:border-accent-primary focus:outline-none" />
            <button type="submit" disabled={!nickInput.trim()}
              className="border-2 border-black bg-accent-primary px-3 py-2 text-xs font-black uppercase text-black disabled:opacity-50">
              {editingNick ? t.chat.saveNick : t.chat.enterButton}
            </button>
          </div>
          {editingNick && <button type="button" onClick={() => { setEditingNick(false); setError(null); }}
            className="mt-2 text-xs font-bold text-gray-300 underline underline-offset-2 hover:text-white">
            {t.chat.cancelNickChange}
          </button>}
        </form>
      )}
    </div>
  );
}
