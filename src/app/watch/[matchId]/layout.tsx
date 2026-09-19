import type { Metadata } from "next";

async function getMatchInfo(matchId: string) {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/matches/${matchId}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.match ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ matchId: string }> }): Promise<Metadata> {
  const { matchId } = await params;
  const match = await getMatchInfo(matchId);

  if (!match) {
    return {
      title: "GolTV Libre — Partido no encontrado",
    };
  }

  const home = match.homeTeam.name;
  const away = match.awayTeam.name;
  const league = match.league.name;
  const title = `${home} vs ${away} — ${league} | GolTV Libre`;
  const description = `Mirá ${home} vs ${away} de ${league} en vivo gratis en GolTV Libre.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "GolTV Libre",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function WatchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
