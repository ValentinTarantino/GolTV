import type { Channel } from "./types";

const STREAM_API_BASE = "https://football-live-stream-api.p.rapidapi.com";
const RAPID_API_KEY = process.env.RAPIDAPI_KEY || "";

interface StreamMatch {
  id: string;
  league: string;
  home_name: string;
  away_name: string;
  status: string;
  score: string;
}

let lastFailureTime = 0;
const COOLDOWN_MS = 5 * 60 * 1000;

export async function getStreamsForMatch(
  homeTeam: string,
  awayTeam: string,
  matchId?: string
): Promise<Channel[]> {
  if (!RAPID_API_KEY) {
    return [];
  }

  if (Date.now() - lastFailureTime < COOLDOWN_MS) {
    return [];
  }

  try {
    if (matchId) {
      const res = await fetch(`${STREAM_API_BASE}/link/${matchId}`, {
        headers: {
          "X-RapidAPI-Key": RAPID_API_KEY,
          "X-RapidAPI-Host": "football-live-stream-api.p.rapidapi.com",
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
      if (data && data.url && data.url.length > 0) {
        return [{
          id: "stream-0",
          name: `${homeTeam} vs ${awayTeam}`,
          url: data.url,
        }];
      }
      return [];
    }

    const res = await fetch(`${STREAM_API_BASE}/all-match`, {
      headers: {
        "X-RapidAPI-Key": RAPID_API_KEY,
        "X-RapidAPI-Host": "football-live-stream-api.p.rapidapi.com",
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
    const matches: StreamMatch[] = data.result || [];

    const match = matches.find(
      (m) =>
        m.home_name?.toLowerCase().includes(homeTeam.toLowerCase()) ||
        m.away_name?.toLowerCase().includes(awayTeam.toLowerCase())
    );

    if (match) {
      const linkRes = await fetch(`${STREAM_API_BASE}/link/${match.id}`, {
        headers: {
          "X-RapidAPI-Key": RAPID_API_KEY,
          "X-RapidAPI-Host": "football-live-stream-api.p.rapidapi.com",
        },
        next: { revalidate: 600 },
      });

      if (linkRes.ok) {
        const linkData = await linkRes.json();
        if (linkData && linkData.url && linkData.url.length > 0) {
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
