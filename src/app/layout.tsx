import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Barlow_Condensed } from "next/font/google";
import "./globals.css";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import DesktopBackgroundParallax from "@/components/layout/DesktopBackgroundParallax";
import BanGate from "@/components/BanGate";
import DevToolsGuard from "@/components/DevToolsGuard";
import ViewerIdentity from "@/components/ViewerIdentity";
import OnlineCounter from "@/components/OnlineCounter";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { TimeZoneProvider } from "@/contexts/TimeZoneContext";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

// Condensed sport face for the fixture team names: uppercase and narrow, so
// long clubs ("Deportes Concepción", "Gimnasia La Plata") stay on one line.
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#c0df00",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || "https://goltv.stream"),
  title: {
    default: "GolTV - Fútbol en vivo gratis | Partidos de hoy, ligas y resultados",
    template: "%s | GolTV",
  },
  description:
    "Mirá deportes en vivo gratis en GolTV. Fútbol, boxeo, tenis y NBA en vivo, con resultados, tablas de posiciones y ligas de Argentina, Brasil, Uruguay, Chile, Colombia, España, Europa y toda Latinoamérica. Sin registro, sin pagos.",
  keywords: [
    "fútbol en vivo",
    "partidos de hoy",
    "ver fútbol gratis",
    "liga argentina en vivo",
    "brasileirão ao vivo",
    "copa libertadores en vivo",
    "resultados fútbol",
    "tabla de posiciones",
    "goltv",
    "streaming fútbol gratis",
    "fútbol hoy",
    "partidos en vivo",
    "boxeo en vivo",
    "mma en vivo",
    "tenis en vivo",
    "nba en vivo",
    "baloncesto en vivo",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: "GolTV - Deportes en vivo gratis",
    description: "Mirá fútbol, boxeo, tenis y NBA en vivo gratis. Liga Argentina, Brasileirão, Copa Libertadores y toda Latinoamérica.",
    type: "website",
    locale: "es_AR",
    siteName: "GolTV",
    images: [
      {
        url: "/api/og?home=Boca+Juniors&away=River+Plate&league=Liga+Profesional",
        width: 1200,
        height: 630,
        alt: "GolTV - Fútbol en vivo gratis",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GolTV - Deportes en vivo gratis",
    description: "Mirá fútbol, boxeo, tenis y NBA en vivo gratis. Liga Argentina, Brasileirão, Copa Libertadores y toda Latinoamérica.",
    images: ["/api/og?home=Boca+Juniors&away=River+Plate&league=Liga+Profesional"],
  },
  icons: {
    icon: "/goltv.png",
    apple: "/goltv.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "GolTV",
  },
};

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://goltv.stream";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      url: BASE_URL,
      name: "GolTV",
      description: "Deportes en vivo gratis - fútbol, boxeo, tenis y NBA, con resultados y tablas de posiciones",
      inLanguage: "es",
      publisher: { "@id": `${BASE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      name: "GolTV",
      url: BASE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/goltv.png`,
      },
      sameAs: [],
    },
    {
      "@type": "WebApplication",
      "@id": `${BASE_URL}/#app`,
      name: "GolTV",
      url: BASE_URL,
      applicationCategory: "SportsApplication",
      operatingSystem: "Web",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "Fútbol en vivo gratis",
        "Resultados en tiempo real",
        "Tablas de posiciones",
        "Sin registro requerido",
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${barlowCondensed.variable} h-full overflow-x-clip`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans antialiased">
        <DesktopBackgroundParallax />
        <BanGate />
        <DevToolsGuard />
        <ViewerIdentity />
        <LanguageProvider>
          <TimeZoneProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
            <OnlineCounter />
          </TimeZoneProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}

