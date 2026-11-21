import { getCache, setCache, incrementCounter } from "./cache";
import { CHAT_DELETED_COLLECTION, getChatCollection, getDb } from "./mongo";
import { isChatColor, isChatPaletteColor, type ChatColors } from "./chat-colors";

export interface ChatMessage {
  id: string;
  matchId: string;
  nick: string;
  text: string;
  ts: number;
  ip?: string;
  nickColor?: string;
  textColor?: string;
  isAdmin?: boolean;
  replyTo?: {
    id: string;
    nick: string;
    text: string;
  };
}

const MAX_MESSAGES_PER_MATCH = 200;
const MAX_DELETED_IDS = 200;
const RATE_LIMIT_MS = 3000;
const CHAT_RATE_LIMIT_KEY = "chat:ratelimit";
const CHAT_MESSAGES_KEY = "chat:messages";
const CHAT_DELETED_KEY = "chat:deleted";
const BANNED_IPS_KEY = "chat:banned_ips";

let msgCounter = 0;

function sanitizeText(input: string): string {
  // Messages are rendered as React text nodes (auto-escaped), so stripping
  // markup is enough; entity-escaping here would double-escape on screen.
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
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
  const collection = await getChatCollection();
  if (collection) {
    // Global check across instances: last message from this nick must be
    // older than the rate limit window.
    try {
      const last = await collection
        .findOne({ nick }, { sort: { ts: -1 }, projection: { ts: 1 } });
      if (last && Date.now() - last.ts < RATE_LIMIT_MS) return false;
      return true;
    } catch {
      // fall through to the in-memory limiter
    }
  }

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

interface DeletedMessageDoc {
  matchId: string;
  id: string;
  ts: number;
}

async function getDeletedCollection() {
  const db = await getDb();
  return db ? db.collection<DeletedMessageDoc>(CHAT_DELETED_COLLECTION) : null;
}

/**
 * Ids of messages deleted from this match. Clients poll with an `offset` and
 * only ever append, so they need this list to drop messages another session
 * removed — otherwise the message survives until the page is reloaded.
 */
export async function getDeletedChatMessageIds(matchId: string): Promise<string[]> {
  const ids = new Set<string>();

  const cached = await getCache<string[]>(`${CHAT_DELETED_KEY}:${matchId}`);
  for (const id of cached ?? []) ids.add(id);

  const collection = await getDeletedCollection();
  if (collection) {
    try {
      const docs = await collection
        .find({ matchId }, { projection: { id: 1 } })
        .sort({ ts: -1 })
        .limit(MAX_DELETED_IDS)
        .toArray();
      for (const doc of docs) ids.add(doc.id);
    } catch (error) {
      console.warn("[chat] MongoDB tombstone read error:", error);
    }
  }

  return Array.from(ids);
}

/** Removes a message and leaves a tombstone so every open chat drops it. */
export async function deleteChatMessage(matchId: string, messageId: string): Promise<boolean> {
  let deleted = false;

  const collection = await getChatCollection();
  if (collection) {
    try {
      const result = await collection.deleteOne({ id: messageId, matchId });
      if (result.deletedCount > 0) deleted = true;
    } catch (error) {
      console.warn("[chat] MongoDB delete error:", error);
    }
  }

  // Cache is both the fallback store and the local mirror used by the reader.
  const messages = await getMessagesFromCache(matchId);
  if (messages.some((message) => message.id === messageId)) {
    await saveMessagesToCache(matchId, messages.filter((message) => message.id !== messageId));
    deleted = true;
  }

  if (!deleted) return false;

  const previous = (await getCache<string[]>(`${CHAT_DELETED_KEY}:${matchId}`)) ?? [];
  const tombstones = previous.includes(messageId) ? previous : [...previous, messageId];
  await setCache(
    `${CHAT_DELETED_KEY}:${matchId}`,
    tombstones.slice(-MAX_DELETED_IDS),
    24 * 60 * 60 * 1000
  );

  const tombstonesCollection = await getDeletedCollection();
  if (tombstonesCollection) {
    try {
      await tombstonesCollection.updateOne(
        { matchId, id: messageId },
        { $set: { ts: Date.now() } },
        { upsert: true }
      );
    } catch (error) {
      console.warn("[chat] MongoDB tombstone write error:", error);
    }
  }

  return true;
}

async function getBannedIPs(): Promise<Set<string>> {
  const cached = await getCache<string[]>(BANNED_IPS_KEY);
  return new Set(cached ?? []);
}

async function saveBannedIPs(ips: Set<string>): Promise<void> {
  await setCache(BANNED_IPS_KEY, Array.from(ips), 24 * 60 * 60 * 1000);
}

export async function isIPBanned(ip: string): Promise<boolean> {
  if (!ip) return false;
  const banned = await getBannedIPs();
  return banned.has(ip);
}

export async function banIP(ip: string): Promise<void> {
  if (!ip) return;
  const banned = await getBannedIPs();
  banned.add(ip);
  await saveBannedIPs(banned);
}

export async function unbanIP(ip: string): Promise<void> {
  if (!ip) return;
  const banned = await getBannedIPs();
  banned.delete(ip);
  await saveBannedIPs(banned);
}

export async function getBannedIPList(): Promise<string[]> {
  const banned = await getBannedIPs();
  return Array.from(banned);
}

export async function getChatMessages(matchId: string, offset: number): Promise<ChatMessage[]> {
  const collection = await getChatCollection();
  
  // Try MongoDB first
  if (collection) {
    try {
      const messages = await collection
        .find({ matchId, ts: { $gte: offset } })
        .sort({ ts: 1 })
        .toArray();
      
      // If we got messages from MongoDB, also update cache for fallback
      if (messages.length > 0) {
        const chatMessages = messages.map(({ id, matchId: mid, nick, text, ts, ip, nickColor, textColor, isAdmin, replyTo }) => ({
          id,
          matchId: mid,
          nick,
          text,
          ts,
          ...(ip ? { ip } : {}),
          ...(isChatColor(nickColor) ? { nickColor } : {}),
          ...(isChatColor(textColor) ? { textColor } : {}),
          ...(isAdmin ? { isAdmin } : {}),
          ...(replyTo ? { replyTo } : {}),
        }));
        await saveMessagesToCache(matchId, chatMessages);
        return chatMessages;
      }
    } catch (error) {
      console.warn("[chat] MongoDB error, falling back to cache:", error);
    }
  }
  
  // Fallback to cache
  const messages = await getMessagesFromCache(matchId);
  return messages.filter((m) => m.ts >= offset);
}

/**
 * Finds a stored message so a reply quotes the real nick/text instead of
 * whatever the client claims. Returns null when the id is unknown.
 */
async function findChatMessage(matchId: string, id: string): Promise<ChatMessage | null> {
  if (!id || id.length > 100) return null;

  const collection = await getChatCollection();
  if (collection) {
    try {
      const doc = await collection.findOne({ id, matchId });
      if (doc) {
        return {
          id: doc.id,
          matchId: doc.matchId,
          nick: doc.nick,
          text: doc.text,
          ts: doc.ts,
        };
      }
    } catch (error) {
      console.warn("[chat] MongoDB reply lookup error:", error);
    }
  }

  const messages = await getMessagesFromCache(matchId);
  return messages.find((message) => message.id === id) ?? null;
}

export async function addChatMessage(
  matchId: string,
  nick: string,
  text: string,
  colors: Partial<ChatColors> & { replyTo?: { id: string; nick: string; text: string }; isAdmin?: boolean; ip?: string } = {}
): Promise<{ ok: boolean; error?: string; persistent?: boolean }> {
  const validId = validateMatchId(matchId);
  if (!validId) return { ok: false, error: "Invalid match ID" };

  const validNick = validateNick(nick);
  if (!validNick) return { ok: false, error: "Invalid nick" };

  const validText = validateMessage(text);
  if (!validText) return { ok: false, error: "Invalid message" };

  if ((colors.nickColor !== undefined && !isChatPaletteColor(colors.nickColor))
    || (colors.textColor !== undefined && !isChatPaletteColor(colors.textColor))) {
    return { ok: false, error: "Invalid message color" };
  }

  if (!await canSend(validNick)) {
    return { ok: false, error: "Rate limited" };
  }

  // A reply quotes a stored message: resolve it server-side so the client
  // cannot forge the quoted nick/text or smuggle unsanitized content.
  let replyTo: ChatMessage["replyTo"];
  if (colors.replyTo?.id) {
    const quoted = await findChatMessage(validId, colors.replyTo.id);
    if (quoted) {
      replyTo = {
        id: quoted.id,
        nick: quoted.nick.slice(0, 20),
        text: quoted.text.slice(0, 140),
      };
    }
  }

  const msg: ChatMessage = {
    // Include randomness: ids must stay unique across serverless instances
    id: `${validId}-${++msgCounter}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    matchId: validId,
    nick: validNick,
    text: validText,
    ts: Date.now(),
    ...(colors.ip ? { ip: colors.ip } : {}),
    ...(colors.nickColor ? { nickColor: colors.nickColor } : {}),
    ...(colors.textColor ? { textColor: colors.textColor } : {}),
    ...(colors.isAdmin ? { isAdmin: true } : {}),
    ...(replyTo ? { replyTo } : {}),
  };

  const collection = await getChatCollection();
  if (collection) {
    try {
      await collection.insertOne(msg);
      // Also save to cache for fallback
      const messages = await getMessagesFromCache(validId);
      messages.push(msg);
      if (messages.length > MAX_MESSAGES_PER_MATCH) {
        messages.splice(0, messages.length - MAX_MESSAGES_PER_MATCH);
      }
      await saveMessagesToCache(validId, messages);
      return { ok: true, persistent: true };
    } catch (error) {
      console.warn("[chat] MongoDB insert error, falling back to cache:", error);
      // Fall back to cache below
    }
  }

  // Use cache fallback
  const messages = await getMessagesFromCache(validId);
  messages.push(msg);

  if (messages.length > MAX_MESSAGES_PER_MATCH) {
    messages.splice(0, messages.length - MAX_MESSAGES_PER_MATCH);
  }

  await saveMessagesToCache(validId, messages);

  return { ok: true, persistent: false };
}
