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
      title: "GolTV",
    };
  }

  const home = match.homeTeam.name;
  const away = match.awayTeam.name;
  const league = match.league.name;
  const title = `${home} vs ${away} — ${league} | GolTV Libre`;
  const description = `Mirá ${home} vs ${away} de ${league} en vivo gratis en GolTV Libre.`;

  const ogImageUrl = new URL("/api/og", process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000");
  ogImageUrl.searchParams.set("home", home);
  ogImageUrl.searchParams.set("away", away);
  ogImageUrl.searchParams.set("league", league);
  if (match.score) {
    ogImageUrl.searchParams.set("score", `${match.score.home} - ${match.score.away}`);
  }
  if (match.status?.short && !["NS", "TBD"].includes(match.status.short)) {
    ogImageUrl.searchParams.set("time", match.status.short === "FT" ? "Finalizado" : `${match.status.elapsed ?? ""}'`);
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "GolTV Libre",
      images: [{ url: ogImageUrl.toString(), width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl.toString()],
    },
  };
}

export default async function WatchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
