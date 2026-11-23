import type { Metadata } from "next";
import HomeClient from "./HomeClient";

export const metadata: Metadata = {
  title: "Partidos de hoy - Fútbol en vivo gratis",
  description:
    "Mirá los partidos de fútbol de hoy en vivo gratis. Liga Profesional Argentina, Brasileirão, Copa Libertadores, La Liga, Premier League y más. Resultados, horarios y streams.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "GolTV - Fútbol en vivo gratis | Partidos de hoy",
    description:
      "Mirá los partidos de fútbol de hoy en vivo gratis. Liga Argentina, Brasileirão, Copa Libertadores y toda Latinoamérica.",
    type: "website",
    locale: "es_AR",
    siteName: "GolTV",
  },
};

export default function HomePage() {
  return <HomeClient />;
}
