# GolTV Libre

[Español](#español) | [English](#english)

---

## Español

### Descripción
GolTV Libre es una plataforma web para seguir y visualizar partidos de fútbol en vivo y transmisiones deportivas en tiempo real. La aplicación integra una interfaz gráfica con diseño Neo-Brutalista, visualización de marcadores y estados en directo, selección de canales de transmisión mediante streaming HLS (HTTP Live Streaming) y soporte bilingüe (Español e Inglés).

### Características Principales
- Agenda de partidos en tiempo real agrupados por ligas y competiciones (Liga Profesional, Copa Libertadores/Sudamericana, Liga de Primera Chile, Liga AUF Uruguaya, Brasileirão, Liga 1 Perú, División Profesional Paraguay, Champions, Europa League, La Liga, Premier, y copas nacionales asociadas).
- Estados de partido en directo (En Vivo, Próximo, Finalizado) con tiempos y marcadores actualizados.
- Reproductor de video HLS integrado compatible con múltiples canales y señales de transmisión.
- Interfaz con estética Neo-Brutalista moderna construida con Tailwind CSS v4.
- Internacionalización completa con selector dinámico de idioma (Español / Inglés).
- Navegación por fechas de partidos.
- Suite de pruebas unitarias automatizadas con Jest y React Testing Library.
- Soporte para despliegue en contenedores con Docker y Docker Compose.

### Tecnologías Utilizadas
- Framework Principal: Next.js 16 (App Router)
- Librería de UI: React 19
- Lenguaje: TypeScript
- Estilos y Diseño: Tailwind CSS v4 (utilizando arquitectura CSS `@theme` nativa)
- Reproducción de Video: Hls.js
- Iconografía: Lucide React
- Testing: Jest, ts-jest, React Testing Library
- Contenedorización: Docker, Docker Compose

### APIs y Fuentes de Datos
- API-Football (API-Sports): Utilizada para consultar fixtures, ligas, escudos, marcadores y estados de partido.
- RapidAPI (`football-live-stream-api`): Utilizada para listar partidos en vivo y obtener URLs HLS (`.m3u8`).

### Configuración de Variables de Entorno
Cree un archivo `.env.local` en la raíz del proyecto:

```env
API_FOOTBALL_KEY=su_clave_api_football
RAPIDAPI_KEY=su_clave_rapidapi
# Opcional: restringir hosts del proxy HLS (sufijos separados por coma)
# HLS_PROXY_ALLOWED_HOST_SUFFIXES=akamaized.net,cloudfront.net,mux.dev
```

### Uso cuidadoso de cuotas (importante)
Para evitar suspensiones por rate limit, la app aplica límites internos conservadores, caches en memoria y cooldown tras un `429`:

| API | Límite interno aprox. | Cache |
|-----|----------------------|-------|
| API-Football | ~70 llamadas/día | fixtures por fecha ~90s; partido por id ~2 min |
| RapidAPI streams | ~35 llamadas/día | `/all-match` ~5 min; `/link` ~10 min |

Recomendaciones:
- No ejecute `npm run test:streams` en bucle (consume cuota de RapidAPI).
- Evite refrescar la home de forma agresiva; el listado ya se revalida cada ~60s.
- Si recibe `429`, espere al menos 5 minutos (cooldown automático).
- En producción puede fijar `HLS_PROXY_ALLOWED_HOST_SUFFIXES` para endurecer el proxy.

### Estructura del Proyecto
```
goltv-libre/
├── src/
│   ├── app/                    # Rutas y páginas (Next.js App Router)
│   │   ├── api/                # Endpoints API internos (matches, standings, etc.)
│   │   ├── watch/[matchId]/    # Página del reproductor de partidos
│   │   ├── globals.css         # Configuración y temas de Tailwind CSS v4
│   │   ├── layout.tsx          # Layout global de la aplicación
│   │   └── page.tsx            # Página de inicio
│   ├── components/             # Componentes modulares
│   │   ├── layout/             # Header, Footer, Navegación
│   │   ├── matches/            # MatchCard, MatchList, LiveBadge, etc.
│   │   ├── player/             # VideoPlayer, ChannelSelector
│   │   └── ui/                 # Skeletons, botones y componentes base
│   ├── contexts/               # Contextos de React (LanguageContext)
│   ├── i18n/                   # Diccionarios de traducción (ES / EN)
│   ├── lib/                    # Tipos, constantes y cliente de API-Football
│   └── __tests__/              # Pruebas unitarias
├── public/                     # Archivos estáticos
├── Dockerfile                  # Configuración de imagen Docker
├── docker-compose.yml          # Orquestación de contenedores
├── package.json                # Dependencias y scripts
└── tsconfig.json               # Configuración de TypeScript
```

### Requisitos Previos
- Node.js versión 18.18 o superior (recomendado Node.js 20+)
- npm, yarn, pnpm o bun
- Claves `API_FOOTBALL_KEY` y `RAPIDAPI_KEY` (opcionales; sin ellas la agenda/streams reales no cargan)

### Aviso Legal
GolTV Libre es un proyecto con fines educativos y de demostración técnica. La aplicación no aloja material audiovisual en sus propios servidores y se limita a indexar o enlazar flujos de terceros disponibles públicamente en internet.

---

## English

### Description
GolTV Libre is a web application designed to track and stream live football matches and sporting events in real time. The platform features a distinctive Neo-Brutalist interface, live scores and match status tracking, multi-channel HLS (HTTP Live Streaming) playback, and full bilingual support (Spanish and English).

### Key Features
- Live match schedule grouped by focused leagues (Argentine Primera, Libertadores/Sudamericana, Chile Liga de Primera, Uruguay Liga AUF, Brasileirão, Peru Liga 1, Paraguay División Profesional, Champions, Europa League, La Liga, Premier, plus national cups).
- Real-time match status (Live, Upcoming, Finished) with dynamic clocks and scores.
- Integrated HLS video player supporting multiple broadcast channels per fixture.
- Modern Neo-Brutalist user interface powered by Tailwind CSS v4.
- Complete internationalization with instant language toggle (Spanish / English).
- Date navigation for fixtures.
- Automated unit test suite using Jest and React Testing Library.
- Containerization support with Docker and Docker Compose.

### Tech Stack
- Core Framework: Next.js 16 (App Router)
- UI Library: React 19
- Language: TypeScript
- Styling: Tailwind CSS v4 (native `@theme` CSS configuration)
- Video Streaming: Hls.js
- Icons: Lucide React
- Testing: Jest, ts-jest, React Testing Library
- Containerization: Docker, Docker Compose

### APIs and Data Sources
- API-Football (API-Sports): Used for fixtures, leagues, crests, scores, and match status.
- RapidAPI (`football-live-stream-api`): Used for live match listings and HLS (`.m3u8`) URLs.

### Environment Variables
Create a `.env.local` file in the root directory:

```env
API_FOOTBALL_KEY=your_api_football_key
RAPIDAPI_KEY=your_rapidapi_key
# Optional: restrict HLS proxy hosts (comma-separated suffixes)
# HLS_PROXY_ALLOWED_HOST_SUFFIXES=akamaized.net,cloudfront.net,mux.dev
```

### Rate-limit hygiene (important)
To reduce suspension risk, the app uses conservative internal caps, in-memory caches, and a cooldown after `429`:

| API | Internal cap (approx.) | Cache |
|-----|------------------------|-------|
| API-Football | ~70 calls/day | fixtures by date ~90s; match by id ~2 min |
| RapidAPI streams | ~35 calls/day | `/all-match` ~5 min; `/link` ~10 min |

Tips:
- Do not loop `npm run test:streams` (burns RapidAPI quota).
- Avoid aggressive home refreshes; the list already revalidates ~every 60s.
- After a `429`, wait at least 5 minutes (automatic cooldown).
- In production you can set `HLS_PROXY_ALLOWED_HOST_SUFFIXES` to harden the proxy.

### Project Structure
```
goltv-libre/
├── src/
│   ├── app/                    # Routes and pages (Next.js App Router)
│   │   ├── api/                # Internal API route handlers
│   │   ├── watch/[matchId]/    # Video player page
│   │   ├── globals.css         # Tailwind CSS v4 configuration and themes
│   │   ├── layout.tsx          # Global application layout
│   │   └── page.tsx            # Home page
│   ├── components/             # Modular components
│   │   ├── layout/             # Header, Footer, Navigation
│   │   ├── matches/            # MatchCard, MatchList, LiveBadge, etc.
│   │   ├── player/             # VideoPlayer, ChannelSelector
│   │   └── ui/                 # Skeletons, buttons and base primitives
│   ├── contexts/               # React Contexts (LanguageContext)
│   ├── i18n/                   # Translation dictionaries (ES / EN)
│   ├── lib/                    # Types, constants, and API-Football client
│   └── __tests__/              # Unit test suites
├── public/                     # Static assets
├── Dockerfile                  # Docker image definition
├── docker-compose.yml          # Container orchestration
├── package.json                # Dependencies and scripts
└── tsconfig.json               # TypeScript configuration
```

### Prerequisites
- Node.js version 18.18 or higher (Node.js 20+ recommended)
- npm, yarn, pnpm, or bun
- `API_FOOTBALL_KEY` and `RAPIDAPI_KEY` (optional; without them real fixtures/streams won't load)

### Legal Disclaimer
GolTV Libre is an educational and technical demonstration project. The platform does not host any video streams on its servers and only links to publicly accessible third-party streams on the internet.
