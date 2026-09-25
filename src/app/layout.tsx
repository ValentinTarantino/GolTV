import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Analytics } from "@vercel/analytics/next";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#ccff00",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"),
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
    images: [
      {
        url: "/api/og?home=Boca+Juniors&away=River+Plate&league=Liga+Profesional",
        width: 1200,
        height: 630,
        alt: "GolTV Libre — Fútbol en vivo gratis",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GolTV Libre — Fútbol en vivo gratis",
    description: "Mirá partidos de fútbol en vivo gratis. Todas las ligas de Latinoamérica.",
    images: ["/api/og?home=Boca+Juniors&away=River+Plate&league=Liga+Profesional"],
  },
  icons: {
    icon: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "GolTV",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased">
        <LanguageProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </LanguageProvider>
        <Analytics />
      </body>
    </html>
  );
}

