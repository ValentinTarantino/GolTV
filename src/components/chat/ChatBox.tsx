"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare, Pencil, Send, Reply, Trash2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { DEFAULT_CHAT_COLORS, isChatColor, isChatPaletteColor, type ChatColors } from "@/lib/chat-colors";
import { getAdminSession, setAdminFlag } from "@/lib/admin";
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
  const [admin, setAdmin] = useState(getAdminSession());
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
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ChatMessage | null>(null);
  const [bannedIPs, setBannedIPs] = useState<Set<string>>(new Set());
  const [ipInfo, setIpInfo] = useState<{ country?: string; city?: string; region?: string; isp?: string } | null>(null);
  const offsetRef = useRef(0);
  // Tombstones of messages this session deleted. The poll can still receive a
  // deleted message (an in-flight request, or a read that raced the delete),
  // so without this it reappears until the page is reloaded.
  const deletedIdsRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const nickInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingNick) {
      nickInputRef.current?.focus();
      nickInputRef.current?.select();
    }
  }, [editingNick]);

  useEffect(() => {
    if (replyingTo) {
      inputRef.current?.focus();
    }
  }, [replyingTo]);

  const fetchBannedIPs = useCallback(async () => {
    if (!admin.isAdmin) return;
    try {
      const res = await fetch("/api/admin/ban-ip");
      const data = await res.json();
      if (data.bannedIPs) {
        setBannedIPs(new Set(data.bannedIPs));
      }
    } catch {
      // Ignore errors
    }
  }, [admin.isAdmin]);

  // Check admin status on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      fetch("/api/admin/session")
        .then(res => res.json())
        .then(data => {
          if (data.isAdmin) {
            setAdminFlag();
            setAdmin(getAdminSession());
            void fetchBannedIPs();
          }
        })
        .catch(() => {});
    }
  }, [fetchBannedIPs]);

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
      setError(null);
      // Tombstones: messages another session deleted. The poll only appends,
      // so without this the deleted message would stay until a reload.
      const removed: string[] = Array.isArray(data.deleted) ? data.deleted : [];
      if (removed.length) {
        const removedSet = new Set(removed);
        setMessages(prev => {
          const next = prev.filter(message => !removedSet.has(message.id));
          return next.length === prev.length ? prev : next;
        });
      }
      if (data.messages?.length) {
        setMessages(prev => {
          const ids = new Set(prev.map(message => message.id));
          const incoming = data.messages.filter((message: ChatMessage) =>
            !ids.has(message.id)
            && !deletedIdsRef.current.has(message.id)
            && !removed.includes(message.id)
          );
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

  const handleDeleteMessage = async (message: ChatMessage) => {
    // Optimistic: hide it right away and keep it buried even if a poll in
    // flight brings it back. The tombstone is lifted only if the delete fails.
    deletedIdsRef.current.add(message.id);
    setMessages(prev => prev.filter(m => m.id !== message.id));
    setReplyingTo(prev => (prev?.id === message.id ? null : prev));
    setError(null);

    try {
      const res = await fetch("/api/admin/delete-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, matchId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Error al borrar mensaje");
      }
    } catch (err) {
      deletedIdsRef.current.delete(message.id);
      setMessages(prev => (prev.some(m => m.id === message.id)
        ? prev
        : [...prev, message].sort((a, b) => a.ts - b.ts)));
      setError(err instanceof Error && err.message ? err.message : "Error al borrar mensaje");
    }
  };

  const handleReply = (message: ChatMessage) => {
    setReplyingTo(message);
    setError(null);
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleSelectUser = async (message: ChatMessage) => {
    if (admin.isAdmin && message.ip) {
      setSelectedUser(message);
      setIpInfo(null);
      try {
        const res = await fetch(`/api/admin/ip-info?ip=${encodeURIComponent(message.ip)}`);
        const data = await res.json();
        if (data.country || data.city) {
          setIpInfo({
            country: data.country,
            city: data.city,
            region: data.region,
            isp: data.isp,
          });
        }
      } catch {
        // Ignore errors
      }
    }
  };

  const handleBanIP = async (ip: string, action: "ban" | "unban") => {
    try {
      const res = await fetch("/api/admin/ban-ip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, action }),
      });
      const data = await res.json();
      if (data.ok) {
        setBannedIPs(prev => {
          const next = new Set(prev);
          if (action === "ban") next.add(ip);
          else next.delete(ip);
          return next;
        });
        setSelectedUser(null);
      } else {
        setError(data.error || "Error al banear IP");
      }
    } catch {
      setError("Error al banear IP");
    }
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
        body: JSON.stringify({ 
          matchId, 
          nick, 
          text, 
          ...colors,
          replyTo: replyingTo ? {
            id: replyingTo.id,
            nick: replyingTo.nick,
            text: replyingTo.text,
          } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "Rate limited" ? t.chat.rateLimit
          : res.status === 503 ? t.chat.storageUnavailable : t.chat.sendError);
        setInput(text);
      } else {
        setReplyingTo(null);
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
      <div className="chat-header flex shrink-0 items-center justify-between gap-2 px-4 py-3 bg-white text-black border-b-4 border-white">
        <div className="flex min-w-0 items-center gap-2">
          <MessageSquare size={16} strokeWidth={3} className="shrink-0" />
          <span className="truncate text-sm font-black uppercase tracking-wider">{t.chat.title}</span>
        </div>
        {nick && <button type="button" aria-label={t.chat.changeNick} title={t.chat.changeNick} disabled={sending}
          onClick={() => { setNickInput(nick); setEditingNick(true); setError(null); }}
          className="max-w-[45%] shrink-0 text-right text-black hover:text-black/70 disabled:opacity-50 flex items-center gap-2">
          <span className="block truncate text-xs font-bold">@{nick}</span>
          {admin.isAdmin && <span className="px-1.5 py-0.5 text-[8px] font-bold bg-red-600 text-white border border-white rounded">ADMIN</span>}
          <span className="inline-flex items-center gap-1 text-[10px] font-bold underline underline-offset-2">
            <Pencil size={10} />{t.chat.changeNick}
          </span>
        </button>}
      </div>

      <div ref={scrollRef} role="log" aria-label={t.chat.title} aria-live="polite" aria-relevant="additions text"
        className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2 min-h-0 break-words">
        {messages.length === 0 ? (
          <p className="text-xs text-text-muted text-center mt-8">{t.chat.messagesEmpty}</p>
        ) : messages.map(message => {
          const own = message.nick === nick;
          const defaultColor = own ? DEFAULT_CHAT_COLORS.nickColor : DEFAULT_CHAT_COLORS.textColor;
          return (
            <div key={message.id} className="group flex items-start gap-2 text-sm leading-relaxed break-words">
              <div className="flex-1 min-w-0">
                {message.replyTo && (
                  <div className="mb-1 pl-2 border-l-2 border-white/30 text-[10px] text-text-muted">
                    <span className="font-bold">@{message.replyTo.nick}: </span>
                    <span className="truncate">{message.replyTo.text}</span>
                  </div>
                )}
                {admin.isAdmin && message.ip ? (
                  <button
                    onClick={() => handleSelectUser(message)}
                    className="font-black shrink-0 hover:underline cursor-pointer"
                    style={{ color: isChatColor(message.nickColor) ? message.nickColor : defaultColor }}
                  >
                    {message.nick}
                  </button>
                ) : (
                  <span className="font-black shrink-0" style={{ color: isChatColor(message.nickColor) ? message.nickColor : defaultColor }}>{message.nick}</span>
                )}
                {message.isAdmin && <span className="px-1 py-0.5 text-[8px] font-bold bg-red-600 text-white border border-white rounded ml-1">ADMIN</span>}
                <span style={{ color: isChatColor(message.textColor) ? message.textColor : defaultColor }}>: {message.text}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleReply(message)}
                  className="p-1 hover:bg-white/20 rounded"
                  title="Responder"
                >
                  <Reply size={12} className="text-white" />
                </button>
                {admin.isAdmin && (
                  <button
                    onClick={() => handleDeleteMessage(message)}
                    className="p-1 hover:bg-red-600 rounded"
                    title="Borrar mensaje"
                  >
                    <Trash2 size={12} className="text-red-500" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <div role="alert" className="shrink-0 px-3 py-1 text-[10px] font-bold text-accent-red text-center">{error}</div>}

      {selectedUser && (
        <div className="shrink-0 border-t-4 border-white bg-black p-4">
          <h3 className="text-white font-bold mb-4 text-sm">Información del usuario</h3>
          <div className="space-y-2 text-xs text-white mb-4">
            <p><span className="font-bold">Nick:</span> {selectedUser.nick}</p>
            <p><span className="font-bold">IP:</span> {selectedUser.ip || "Desconocida"}</p>
            {ipInfo && (
              <>
                {ipInfo.country && <p><span className="font-bold">País:</span> {ipInfo.country}</p>}
                {ipInfo.city && <p><span className="font-bold">Ciudad:</span> {ipInfo.city}</p>}
                {ipInfo.region && <p><span className="font-bold">Región:</span> {ipInfo.region}</p>}
                {ipInfo.isp && <p><span className="font-bold">ISP:</span> {ipInfo.isp}</p>}
              </>
            )}
            {selectedUser.ip && bannedIPs.has(selectedUser.ip) && (
              <p className="text-red-500 font-bold">Esta IP está baneada</p>
            )}
          </div>
          <div className="flex gap-2">
            {selectedUser.ip && !bannedIPs.has(selectedUser.ip) && (
              <button
                onClick={() => handleBanIP(selectedUser.ip!, "ban")}
                className="flex-1 bg-red-600 text-white px-3 py-2 text-xs font-bold hover:bg-red-700"
              >
                Banear IP
              </button>
            )}
            {selectedUser.ip && bannedIPs.has(selectedUser.ip) && (
              <button
                onClick={() => handleBanIP(selectedUser.ip!, "unban")}
                className="flex-1 bg-green-600 text-white px-3 py-2 text-xs font-bold hover:bg-green-700"
              >
                Desbanear IP
              </button>
            )}
            <button
              onClick={() => { setSelectedUser(null); setIpInfo(null); }}
              className="flex-1 bg-gray-600 text-white px-3 py-2 text-xs font-bold hover:bg-gray-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className="chat-color-controls grid shrink-0 grid-cols-2 gap-3 border-t-2 border-white/30 px-3 py-2">
        {(["nickColor", "textColor"] as const).map(field => (
          <ChatColorSelect key={field} label={t.chat[field]} value={colors[field]} alignEnd={field === "textColor"}
            onChange={color => changeColor(field, color)} />
        ))}
      </div>

      {replyingTo && (
        <div className="shrink-0 px-3 py-2 bg-white/10 border-t-2 border-white/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-text-muted">Respondiendo a @{replyingTo.nick}</p>
              <p className="text-xs text-white truncate">{replyingTo.text}</p>
            </div>
            <button
              onClick={handleCancelReply}
              className="text-[10px] font-bold text-accent-red hover:text-red-400"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {nick && !editingNick ? (
        <form onSubmit={event => { event.preventDefault(); void handleSend(); }} className="chat-composer flex shrink-0 gap-2 p-3 border-t-4 border-white">
          <input ref={inputRef} type="text" value={input} onChange={event => setInput(event.target.value)}
            maxLength={500} placeholder={t.chat.placeholder} aria-label={t.chat.placeholder}
            style={{ color: colors.textColor }}
            className="flex-1 px-3 py-2 bg-black border-2 border-white/40 text-sm font-bold focus:border-accent-primary focus:outline-none min-w-0" />
          <button type="submit" aria-label={t.chat.sendButton} title={t.chat.sendButton} disabled={sending || !input.trim()}
            className="flex items-center justify-center h-9 w-9 bg-accent-primary text-black border-2 border-black shrink-0 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            <Send size={14} strokeWidth={3} />
          </button>
        </form>
      ) : (
        <form onSubmit={event => { event.preventDefault(); handleEnterNick(); }} className="chat-composer shrink-0 border-t-4 border-white p-3">
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
