import { getDb } from "./mongo";

/**
 * URL of the home relay (the owner's machine exposed through a Cloudflare
 * tunnel). The provider only serves stream data to residential IPs, so the
 * deployment forwards sportplus requests through it when it is online.
 *
 * The relay script registers its current tunnel URL in Mongo on startup, so
 * quick-tunnel URL rotations need no manual configuration.
 */

const COLLECTION = "config";
const DOC_KEY = "lpf_home_relay";
const CACHE_TTL = 60 * 1000;

let memoryUrl: string | null = null;
let memoryAt = 0;
let memoryFallback: string | null = null;

interface RelayDoc {
  key?: string;
  url?: string;
  at?: number;
}

/** Current home-relay base URL, or null when the relay is offline/unknown. */
export async function getHomeRelayUrl(): Promise<string | null> {
  if (memoryUrl && Date.now() - memoryAt < CACHE_TTL) return memoryUrl;

  try {
    const db = await getDb();
    if (db) {
      const doc = await db.collection<RelayDoc>(COLLECTION).findOne({ key: DOC_KEY });
      if (doc?.url) {
        memoryUrl = doc.url.replace(/\/$/, "");
        memoryAt = Date.now();
        return memoryUrl;
      }
    }
  } catch {
    /* fall through to memory */
  }

  // Mongo unavailable: keep serving the last URL seen in this instance.
  return memoryFallback;
}

/** Registers the relay URL (called by the tunnel script on startup). */
export async function setHomeRelayUrl(url: string): Promise<void> {
  const clean = url.replace(/\/$/, "");
  memoryFallback = clean;
  memoryUrl = clean;
  memoryAt = Date.now();
  try {
    const db = await getDb();
    if (db) {
      await db.collection(COLLECTION).updateOne(
        { key: DOC_KEY },
        { $set: { key: DOC_KEY, url: clean, at: Date.now() } },
        { upsert: true }
      );
    }
  } catch {
    /* memory fallback already updated */
  }
}
