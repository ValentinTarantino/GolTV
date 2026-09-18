# GolTV Libre

[Español](#español) | [English](#english)

---

## Español

### Descripción
GolTV Libre es una plataforma web para seguir y visualizar partidos de fútbol en vivo y transmisiones deportivas en tiempo real. La aplicación integra una interfaz gráfica con diseño Neo-Brutalista, visualización de marcadores y estados en directo, selección de canales de transmisión mediante streaming HLS (HTTP Live Streaming) y soporte bilingüe (Español e Inglés).

### Características Principales
- Agenda de partidos en tiempo real agrupados por ligas y competiciones (Copa Libertadores, Copa Sudamericana, Liga Profesional Argentina, La Liga, Premier League, Liga BetPlay, etc.).
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
- API-Football (API-Sports): Utilizada para consultar partidos, ligas, escudos de equipos, trofeos de torneos, marcadores y tablas de posiciones.
- Canales de Streaming HLS: Integración de flujos de video `.m3u8` asociados dinámicamente a cada encuentro deportivo.

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
- Clave de API de API-Football (opcional para datos reales)

### Configuración de Variables de Entorno
Cree un archivo `.env.local` en la raíz del proyecto con la siguiente variable:

```env
API_FOOTBALL_KEY=su_clave_de_api_aqui
```

### Ejecución del Proyecto

Iniciar el servidor de desarrollo:
```bash
npm run dev
```
La aplicación estará disponible en `http://localhost:3000`.

Ejecutar pruebas unitarias:
```bash
npm test
```

Compilar para producción:
```bash
npm run build
npm start
```

### Ejecución con Docker

Construcción y ejecución directa:
```bash
npm run docker:build
npm run docker:run
```

O mediante Docker Compose:
```bash
npm run docker:compose
```

### Aviso Legal
GolTV Libre es un proyecto con fines educativos y de demostración técnica. La aplicación no aloja material audiovisual en sus propios servidores y se limita a indexar o enlazar flujos de terceros disponibles públicamente en internet.

---

## English

### Description
GolTV Libre is a web application designed to track and stream live football matches and sporting events in real time. The platform features a distinctive Neo-Brutalist interface, live scores and match status tracking, multi-channel HLS (HTTP Live Streaming) playback, and full bilingual support (Spanish and English).

### Key Features
- Live match schedule grouped by leagues and tournaments (Copa Libertadores, Copa Sudamericana, Argentine Primera Division, La Liga, Premier League, Liga BetPlay, etc.).
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
- API-Football (API-Sports): Used for retrieving fixtures, league details, team crests, competition logos, live scores, and tournament standings.
- HLS Streaming Streams: Dynamic `.m3u8` video source integration mapped to corresponding fixtures.

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
- API-Football API key (optional for real data)

### Environment Variables
Create a `.env.local` file in the root directory:

```env
API_FOOTBALL_KEY=your_api_key_here
```

### Running the Project

Run the development server:
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

Run tests:
```bash
npm test
```

Build for production:
```bash
npm run build
npm start
```

### Docker Deployment

Build and run using Docker:
```bash
npm run docker:build
npm run docker:run
```

Or using Docker Compose:
```bash
npm run docker:compose
```

### Legal Disclaimer
GolTV Libre is an educational and technical demonstration project. The platform does not host any video streams on its servers and only links to publicly accessible third-party streams on the internet.
