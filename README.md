# GolTV Libre

[Espanol](#espanol) | [English](#english)

---

## Espanol

### Descripcion

GolTV Libre es una plataforma web gratuita para seguir y ver partidos de futbol en vivo. La interfaz tiene estilo Neo-Brutalista, reproduce streams HLS de multiples canales, tiene chat en vivo por partido y funciona en espanol e ingles.

### Caracteristicas

- Agenda de partidos en vivo agrupada por ligas y competiciones
- 26 ligas cubiertas: Liga Profesional, Copa de la Liga, Copa Argentina, Brasileirao Serie A, Copa do Brasil, Liga de Primera Chile, Copa Chile, Liga 1 Peru, Copa Peru, Copa Paraguay, Liga AUF Uruguaya, Copa Uruguay, Copa Libertadores, Copa Sudamericana, Champions League, Europa League, La Liga, Premier League, Bundesliga, 3. Liga, Serie A Italia, Coppa Italia, MLS, Liga MX, CONCACAF Champions Cup, Leagues Cup
- Estados en tiempo real: En Vivo, Proximo, Finalizado con marcadores y tiempos
- Reproductor HLS integrado con selector de canales y reload
- Chat en vivo por partido con smart scroll (scrollea automaticamente si estas cerca del fondo, te deja leer si scrolleaste arriba)
- Busqueda de equipos en el header
- Logos de equipos via TheSportsDB con fuzzy matching y aliases
- Navegacion por fechas para ver partidos de otros dias
- Auto-refresh de marcadores cada 30 segundos cuando hay partidos en vivo
- Scroll restoration: al volver de un partido al home, se conserva la posicion
- Meta tags Open Graph para compartir links en redes sociales
- Bilingue (Espanol / Ingles) con toggle dinamico
- Logo custom como favicon

### Stack Tecnologico

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19
- **Lenguaje:** TypeScript
- **Estilos:** Tailwind CSS v4
- **Video:** Hls.js
- **Iconos:** Lucide React
- **Testing:** Jest, React Testing Library
- **Contenedorizacion:** Docker, Docker Compose

### Fuentes de Datos

- **PelotaLibre.biz:** Fuente principal. Scraping del agenda HTML, resolucion de streams, limite diario 300 requests, cache 30 min
- **API-Football (API-Sports):** Fixtures, ligas, escudos, marcadores. Multi-key rotation, limite ~70 llamadas/key/dia, cache 90s-2min
- **RapidAPI (football-live-stream-api):** Partidos en vivo y URLs HLS. Limite ~35 llamadas/dia, cache 5-10 min
- **TheSportsDB:** Logos de equipos y ligas con busqueda fuzzy

### Variables de Entorno

Archivo `.env.local` en la raiz del proyecto:

```
API_FOOTBALL_KEY=clave_api_football
RAPIDAPI_KEY=clave_rapidapi
```

### Uso Cuidadoso de Cuotas

| API | Limite interno | Cache |
|-----|---------------|-------|
| API-Football | ~70 llamadas/key/dia | fixtures ~90s, partido ~2min |
| RapidAPI | ~35 llamadas/dia | all-match ~5min, link ~10min |
| PelotaLibre | 300 llamadas/dia | agenda revalida ~5min, streams ~30min |

- No ejecutar `npm run test:streams` en bucle
- Si recibe 429, espere 5 minutos (cooldown automatico)

### Scripts Disponibles

| Script | Descripcion |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de produccion |
| `npm run lint` | Linter ESLint |
| `npm test` | Ejecutar tests (49 tests, 4 suites) |
| `npm run validate` | Lint + TypeScript + Tests + Build |
| `npm run docker:build` | Construir imagen Docker |
| `npm run docker:compose` | Levantar con Docker Compose |

### Estructura del Proyecto

```
goltv-libre/
  src/
    app/                    # Rutas y paginas (App Router)
      api/                  # Endpoints API (matches, chat, health)
      watch/[matchId]/      # Pagina del reproductor
      globals.css           # Temas y animaciones Tailwind
      layout.tsx            # Layout global
      page.tsx              # Home
    components/             # Componentes
      layout/               # Header, Footer
      matches/              # MatchCard, MatchList, LiveBadge, DateNavigator
      player/               # VideoPlayer, IframePlayer, ChannelSelector
      chat/                 # ChatBox
      search/               # SearchBar, MobileMenu
      ui/                   # Skeleton, FootballLoader
    contexts/               # LanguageContext
    i18n/                   # Diccionarios ES/EN
    lib/                    # Logica: API clients, tipos, constantes, utils
  Dockerfile                # Build multi-stage
  docker-compose.yml        # Orquestacion de contenedores
  package.json              # Dependencias y scripts
```

### Aviso Legal

GolTV Libre es un proyecto con fines educativos y de demostracion tecnica. La aplicacion no aloja material audiovisual en sus propios servidores y se limita a indexar o enlazar flujos de terceros disponibles publicamente en internet.

---

## English

### Description

GolTV Libre is a free web platform for watching live football matches. It features a Neo-Brutalist UI, multi-channel HLS stream playback, live chat per match, and works in both Spanish and English.

### Features

- Live match schedule grouped by leagues and competitions
- 26 leagues covered: Liga Profesional, Copa de la Liga, Copa Argentina, Brasileirao Serie A, Copa do Brasil, Liga de Primera Chile, Copa Chile, Liga 1 Peru, Copa Peru, Copa Paraguay, Liga AUF Uruguaya, Copa Uruguay, Copa Libertadores, Copa Sudamericana, Champions League, Europa League, La Liga, Premier League, Bundesliga, 3. Liga, Serie A Italia, Coppa Italia, MLS, Liga MX, CONCACAF Champions Cup, Leagues Cup
- Real-time statuses: Live, Upcoming, Finished with scores and timers
- Integrated HLS player with channel selector and reload
- Live chat per match with smart scroll (auto-scrolls near the bottom, lets you read if you scrolled up)
- Team search in the header
- Team logos via TheSportsDB with fuzzy matching and aliases
- Date navigation to view matches from other days
- Auto-refresh of scores every 30 seconds when there are live matches
- Scroll restoration: preserves your position when navigating back from a match
- Open Graph meta tags for sharing links on social media
- Bilingual (Spanish / English) with dynamic toggle
- Custom logo as favicon

### Tech Stack

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Video:** Hls.js
- **Icons:** Lucide React
- **Testing:** Jest, React Testing Library
- **Containerization:** Docker, Docker Compose

### Data Sources

- **PelotaLibre.biz:** Primary source. HTML agenda scraping, stream resolution, 300 daily request limit, 30 min cache
- **API-Football (API-Sports):** Fixtures, leagues, crests, scores. Multi-key rotation, ~70 calls/key/day limit, 90s-2min cache
- **RapidAPI (football-live-stream-api):** Live matches and HLS URLs. ~35 calls/day limit, 5-10 min cache
- **TheSportsDB:** Team and league logos with fuzzy search

### Environment Variables

File `.env.local` in the project root:

```
API_FOOTBALL_KEY=your_api_football_key
RAPIDAPI_KEY=your_rapidapi_key
```

### Rate Limit Management

| API | Internal limit | Cache |
|-----|---------------|-------|
| API-Football | ~70 calls/key/day | fixtures ~90s, match ~2min |
| RapidAPI | ~35 calls/day | all-match ~5min, link ~10min |
| PelotaLibre | 300 calls/day | agenda revalidates ~5min, streams ~30min |

- Do not loop `npm run test:streams`
- After a 429, wait at least 5 minutes (automatic cooldown)

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint linter |
| `npm test` | Run tests (49 tests, 4 suites) |
| `npm run validate` | Lint + TypeScript + Tests + Build |
| `npm run docker:build` | Build Docker image |
| `npm run docker:compose` | Start with Docker Compose |

### Project Structure

```
goltv-libre/
  src/
    app/                    # Routes and pages (App Router)
      api/                  # API endpoints (matches, chat, health)
      watch/[matchId]/      # Player page
      globals.css           # Tailwind themes and animations
      layout.tsx            # Global layout
      page.tsx              # Home
    components/             # Components
      layout/               # Header, Footer
      matches/              # MatchCard, MatchList, LiveBadge, DateNavigator
      player/               # VideoPlayer, IframePlayer, ChannelSelector
      chat/                 # ChatBox
      search/               # SearchBar, MobileMenu
      ui/                   # Skeleton, FootballLoader
    contexts/               # LanguageContext
    i18n/                   # Translation dictionaries (ES/EN)
    lib/                    # Logic: API clients, types, constants, utils
  Dockerfile                # Multi-stage build
  docker-compose.yml        # Container orchestration
  package.json              # Dependencies and scripts
```

### Legal Disclaimer

GolTV Libre is an educational and technical demonstration project. The platform does not host any video content on its servers and only links to publicly accessible third-party streams on the internet.
