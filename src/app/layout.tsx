import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GolTV Libre — Fútbol en vivo gratis",
  description:
    "Mirá partidos de fútbol en vivo gratis. Liga Argentina, Copa Libertadores, Brasileirão, Liga MX y toda Latinoamérica. Sin registro, sin pagos.",
  keywords: [
    "fútbol en vivo",
    "ver partidos gratis",
    "liga argentina",
    "copa libertadores",
    "streaming fútbol",
    "goltv",
  ],
  openGraph: {
    title: "GolTV Libre — Fútbol en vivo gratis",
    description: "Mirá partidos de fútbol en vivo gratis. Todas las ligas de Latinoamérica.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
