import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Canales de TV en vivo",
  description:
    "Mirá canales de televisión en vivo gratis: deportes, noticias y entretenimiento. Streaming online sin registro en GolTV.",
  alternates: {
    canonical: "/canales",
  },
};

export default function CanalesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
