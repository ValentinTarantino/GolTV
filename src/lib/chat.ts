export interface ChatMessage {
  id: string;
  matchId: string;
  nick: string;
  text: string;
  ts: number;
}

const chatStore = new Map<string, ChatMessage[]>();
const MAX_MESSAGES_PER_MATCH = 200;

const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 3000;

let msgCounter = 0;

function sanitizeText(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
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

function canSend(nick: string): boolean {
  const now = Date.now();
  const last = rateLimitMap.get(nick) ?? 0;
  if (now - last < RATE_LIMIT_MS) return false;
  rateLimitMap.set(nick, now);
  return true;
}

export function getChatMessages(matchId: string, offset: number): ChatMessage[] {
  const messages = chatStore.get(matchId) ?? [];
  return messages.filter((m) => m.ts >= offset);
}

export function addChatMessage(
  matchId: string,
  nick: string,
  text: string
): { ok: boolean; error?: string } {
  const validId = validateMatchId(matchId);
  if (!validId) return { ok: false, error: "Invalid match ID" };

  const validNick = validateNick(nick);
  if (!validNick) return { ok: false, error: "Invalid nick" };

  const validText = validateMessage(text);
  if (!validText) return { ok: false, error: "Invalid message" };

  if (!canSend(validNick)) {
    return { ok: false, error: "Rate limited" };
  }

  const messages = chatStore.get(validId) ?? [];

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

  chatStore.set(validId, messages);

  return { ok: true };
}
