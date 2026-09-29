import { MongoClient, type Db, type Collection } from "mongodb";
import type { ChatMessage } from "./chat";

const MONGODB_URI = process.env.MONGODB_URI || "";
const MONGODB_DB = process.env.MONGODB_DB || "goltv";

export const CHAT_COLLECTION = "chat_messages";
export const CHAT_TTL_SECONDS = 24 * 60 * 60;

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
  const collection = db.collection(CHAT_COLLECTION);
  await Promise.all([
    collection.createIndex({ matchId: 1, ts: 1 }),
    // Auto-delete messages older than 24h
    collection.createIndex({ ts: 1 }, { expireAfterSeconds: CHAT_TTL_SECONDS }),
  ]);
}

export async function getChatCollection(): Promise<Collection<ChatMessage> | null> {
  if (!isMongoConfigured()) return null;

  if (!globalRef.__goltvMongo) {
    globalRef.__goltvMongo = connect(MONGODB_URI);
  }

  try {
    const db = await globalRef.__goltvMongo.ready;
    return db.collection<ChatMessage>(CHAT_COLLECTION);
  } catch {
    return null;
  }
}
