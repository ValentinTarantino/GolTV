import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Boxeo en vivo",
  description:
    "Mirá peleas de boxeo en vivo gratis. Combates, eventos y funciones de boxeo en streaming online en GolTV.",
  alternates: {
    canonical: "/boxeo",
  },
};

export default function BoxeoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
