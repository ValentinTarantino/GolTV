import type { Channel } from "./types";

const STREAM_API_BASE = "https://all-sport-live-stream.p.rapidapi.com";
const RAPID_API_KEY = process.env.RAPIDAPI_KEY || "";

interface SportMatch {
  id: string;
  home_name: string;
  away_name: string;
  league: string;
  status: string;
}

let lastFailureTime = 0;
const COOLDOWN_MS = 5 * 60 * 1000;

export async function getStreamsForMatch(
  homeTeam: string,
  awayTeam: string,
  matchId?: number
): Promise<Channel[]> {
  if (!RAPID_API_KEY) {
    return [];
  }

  if (Date.now() - lastFailureTime < COOLDOWN_MS) {
    return [];
  }

  try {
    if (matchId) {
      const res = await fetch(`${STREAM_API_BASE}/esid?id=${matchId}`, {
        headers: {
          "X-RapidAPI-Key": RAPID_API_KEY,
          "X-RapidAPI-Host": "all-sport-live-stream.p.rapidapi.com",
        },
        next: { revalidate: 600 },
      });

      if (!res.ok) {
        if (res.status === 429) {
          lastFailureTime = Date.now();
          console.warn("Stream API rate limited, cooling down for 5 min");
        }
        return [];
      }

      const data = await res.json();
      if (data && data.url) {
        return [{
          id: "stream-0",
          name: `${homeTeam} vs ${awayTeam}`,
          url: data.url,
        }];
      }
      return [];
    }

    const res = await fetch(`${STREAM_API_BASE}/esid`, {
      headers: {
        "X-RapidAPI-Key": RAPID_API_KEY,
        "X-RapidAPI-Host": "all-sport-live-stream.p.rapidapi.com",
      },
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      if (res.status === 429) {
        lastFailureTime = Date.now();
        console.warn("Stream API rate limited, cooling down for 5 min");
      }
      return [];
    }

    const data = await res.json();
    const matches: SportMatch[] = Array.isArray(data) ? data : data.result || data.matches || [];

    const match = matches.find(
      (m) =>
        m.home_name?.toLowerCase().includes(homeTeam.toLowerCase()) ||
        m.away_name?.toLowerCase().includes(awayTeam.toLowerCase())
    );

    if (match) {
      const linkRes = await fetch(`${STREAM_API_BASE}/esid?id=${match.id}`, {
        headers: {
          "X-RapidAPI-Key": RAPID_API_KEY,
          "X-RapidAPI-Host": "all-sport-live-stream.p.rapidapi.com",
        },
        next: { revalidate: 600 },
      });

      if (linkRes.ok) {
        const linkData = await linkRes.json();
        if (linkData && linkData.url) {
          return [{
            id: "stream-0",
            name: `${homeTeam} vs ${awayTeam}`,
            url: linkData.url,
          }];
        }
      }
    }
  } catch (error) {
    console.warn("Failed to fetch streams:", error);
  }

  return [];
}
