import { MongoClient, type Db, type Collection } from "mongodb";
import type { ChatMessage } from "./chat";

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "goltv";

export const CHAT_COLLECTION = "chat_messages";
export const CHAT_TTL_SECONDS = 24 * 60 * 60;

export const VIEWERS_COLLECTION = "viewers";
export const VIEWERS_TTL_SECONDS = 60;

export interface ViewerDoc {
  matchId: string;
  viewerId: string;
  lastSeen: number;
}

interface CachedClient {
  client: MongoClient;
  ready: Promise<Db>;
}

// Cache the client across hot reloads / serverless invocations so we never
// open more connections than necessary (atlas free tier has a low max).
const globalRef = globalThis as typeof globalThis & {
  __goltvMongo?: CachedClient | null;
};

export function isMongoConfigured(): boolean {
  return MONGODB_URI.length > 0;
}

function connect(uri: string): CachedClient {
  const client = new MongoClient(uri, {
    maxPoolSize: 5,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
    appName: "goltv-libre",
  });

  const ready = client
    .connect()
    .then(async () => {
      const db = client.db(MONGODB_DB);
      await ensureIndexes(db);
      return db;
    })
    .catch((err) => {
      globalRef.__goltvMongo = null;
      console.error("[mongo] connection failed:", err);
      throw err;
    });

  return { client, ready };
}

async function ensureIndexes(db: Db): Promise<void> {
  const chat = db.collection(CHAT_COLLECTION);
  const viewers = db.collection(VIEWERS_COLLECTION);
  await Promise.all([
    chat.createIndex({ matchId: 1, ts: 1 }),
    // Auto-delete messages older than 24h
    chat.createIndex({ ts: 1 }, { expireAfterSeconds: CHAT_TTL_SECONDS }),
    // One live entry per viewer per match (heartbeat upsert)
    viewers.createIndex({ matchId: 1, viewerId: 1 }, { unique: true }),
    // Safety cleanup: entries stop being relevant long before this
    viewers.createIndex({ lastSeen: 1 }, { expireAfterSeconds: VIEWERS_TTL_SECONDS }),
  ]);
}

/**
 * Returns the db, or `null` when MONGODB_URI is not set (tests / local dev
 * without a database fall back to the in-memory store) or when the
 * connection fails — callers fall back instead of failing the request.
 */
async function getDb(): Promise<Db | null> {
  if (!isMongoConfigured()) return null;

  if (!globalRef.__goltvMongo) {
    globalRef.__goltvMongo = connect(MONGODB_URI);
  }

  try {
    return await globalRef.__goltvMongo.ready;
  } catch {
    return null;
  }
}

/** Chat collection, or `null` to signal "use the in-memory fallback". */
export async function getChatCollection(): Promise<Collection<ChatMessage> | null> {
  const db = await getDb();
  return db ? db.collection<ChatMessage>(CHAT_COLLECTION) : null;
}

/** Viewers collection, or `null` to signal "use the in-memory fallback". */
export async function getViewersCollection(): Promise<Collection<ViewerDoc> | null> {
  const db = await getDb();
  return db ? db.collection<ViewerDoc>(VIEWERS_COLLECTION) : null;
}
