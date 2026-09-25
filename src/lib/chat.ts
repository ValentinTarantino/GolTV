import { getCache, setCache, incrementCounter } from "./cache";

export interface ChatMessage {
  id: string;
  matchId: string;
  nick: string;
  text: string;
  ts: number;
}

const MAX_MESSAGES_PER_MATCH = 200;
const RATE_LIMIT_MS = 3000;
const CHAT_RATE_LIMIT_KEY = "chat:ratelimit";
const CHAT_MESSAGES_KEY = "chat:messages";

let msgCounter = 0;

function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .trim();
}

function validateNick(nick: string): string | null {
  if (typeof nick !== "string") return null;
  const trimmed = nick.trim();
  if (trimmed.length < 1 || trimmed.length > 20) return null;
  if (!/^[a-zA-Z0-9 _-]+$/.test(trimmed)) return null;
  return trimmed;
}

function validateMessage(text: string): string | null {
  if (typeof text !== "string") return null;
  const sanitized = sanitizeText(text);
  if (sanitized.length < 1 || sanitized.length > 500) return null;
  return sanitized;
}

function validateMatchId(matchId: string): string | null {
  if (typeof matchId !== "string") return null;
  if (!/^\d+$/.test(matchId)) return null;
  return matchId;
}

async function canSend(nick: string): Promise<boolean> {
  const key = `${CHAT_RATE_LIMIT_KEY}:${nick}`;
  const count = await incrementCounter(key, RATE_LIMIT_MS);
  return count === 1;
}

async function getMessagesFromCache(matchId: string): Promise<ChatMessage[]> {
  const cached = await getCache<ChatMessage[]>(`${CHAT_MESSAGES_KEY}:${matchId}`);
  return cached ?? [];
}

async function saveMessagesToCache(matchId: string, messages: ChatMessage[]): Promise<void> {
  await setCache(`${CHAT_MESSAGES_KEY}:${matchId}`, messages, 24 * 60 * 60 * 1000);
}

export async function getChatMessages(matchId: string, offset: number): Promise<ChatMessage[]> {
  const messages = await getMessagesFromCache(matchId);
  return messages.filter((m) => m.ts >= offset);
}

export async function addChatMessage(
  matchId: string,
  nick: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const validId = validateMatchId(matchId);
  if (!validId) return { ok: false, error: "Invalid match ID" };

  const validNick = validateNick(nick);
  if (!validNick) return { ok: false, error: "Invalid nick" };

  const validText = validateMessage(text);
  if (!validText) return { ok: false, error: "Invalid message" };

  if (!await canSend(validNick)) {
    return { ok: false, error: "Rate limited" };
  }

  const messages = await getMessagesFromCache(validId);

  const msg: ChatMessage = {
    id: `${validId}-${++msgCounter}-${Date.now()}`,
    matchId: validId,
    nick: validNick,
    text: validText,
    ts: Date.now(),
  };

  messages.push(msg);

  if (messages.length > MAX_MESSAGES_PER_MATCH) {
    messages.splice(0, messages.length - MAX_MESSAGES_PER_MATCH);
  }

  await saveMessagesToCache(validId, messages);

  return { ok: true };
}