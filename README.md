# GolTV Libre

[Espanol](#espanol) | [English](#english)

---

## Espanol

### Descripcion

GolTV Libre es una plataforma web gratuita para seguir y ver partidos de futbol en vivo. La interfaz tiene estilo Neo-Brutalista, reproduce streams HLS de multiples canales, tiene chat en vivo por partido y funciona en espanol e ingles.

### Caracteristicas

- Agenda de partidos en vivo agrupada por ligas y competiciones
- 15 ligas cubiertas: Liga Profesional, Copa Argentina, Brasileirao Serie A, Copa do Brasil, Liga AUF Uruguaya, Copa Libertadores, Copa Sudamericana, Champions League, Europa League, La Liga, Premier League, Bundesliga, Serie A Italia, MLS, CONCACAF Champions Cup
- Tablas de posiciones y brackets de copa en la pagina de ligas (scraping de Promiedos)
- Estados en tiempo real: En Vivo, Proximo, Finalizado con marcadores y tiempos
- Reproductor HLS integrado con selector de canales y reload
- Chat en vivo por partido con smart scroll (scrollea automaticamente si estas cerca del fondo, te deja leer si scrolleaste arriba)
- Busqueda de equipos en el header
- Logos de equipos via TheSportsDB con fuzzy matching y aliases
- Navegacion por fechas para ver partidos de otros dias
- Auto-refresh de marcadores cada 30 segundos cuando hay partidos en vivo
- Scroll restoration: al volver de un partido al home, se conserva la posicion
- Meta tags Open Graph + OG images dinamicas para compartir links en redes sociales
- Sitemap XML dinamico, robots.txt y manifest.json (PWA-ready)
- Bilingue (Espanol / Ingles) con toggle dinamico
- Logo custom como favicon

### Stack Tecnologico

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19
- **Lenguaje:** TypeScript
- **Estilos:** Tailwind CSS v4
- **Video:** Hls.js
- **Iconos:** Lucide React
- **Testing:** Jest 30, React Testing Library, Cypress 16
- **CI/CD:** GitHub Actions
- **Contenedorizacion:** Docker, Docker Compose

### Fuentes de Datos

- **FutbolLibre:** Fuente principal. JSON estatico en Bunny CDN (Strapi v4),解析 de partidos, resolucion de embeds. Cache 30 min
- **PelotaLibre:** Fuente secundaria. Scraping del agenda HTML, multiples fuentes por partido. Cache 30 min
- **API-Football (API-Sports):** Fixtures, ligas, escudos, marcadores. Multi-key rotation, limite ~70 llamadas/key/dia, cache 90s-2min
- **RapidAPI (football-live-stream-api):** Partidos en vivo y URLs HLS. Limite ~35 llamadas/dia, cache 5-10 min
- **Promiedos:** Tablas de posiciones y bracket de copas. Scraping de __NEXT_DATA__. Cache 10 min
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
| FutbolLibre | Sin limite fijo | agenda ~30min |
| PelotaLibre | 300 llamadas/dia | agenda revalida ~5min, streams ~30min |

- No ejecutar `npm run test:streams` en bucle
- Si recibe 429, espere 5 minutos (cooldown automatico)

### Testing

| Tipo | Tests | Descripcion |
|------|-------|-------------|
| Unit (Jest) | 49 | Constantes, utilidades, streaming, tipos, API routes |
| API Routes (Jest) | 34 | matches, match-by-id, standings, leagues, chat, health |
| E2E (Cypress) | 32 | Home, navegacion, busqueda, ligas, responsive, idioma |
| **Total** | **115** | **Cobertura completa de stack** |

```bash
npm test                          # 83 tests Jest
npx cypress run                   # 32 tests E2E
npm run validate                  # Lint + TypeScript + Jest + Build
```

### Scripts Disponibles

| Script | Descripcion |
|--------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de produccion |
| `npm run lint` | Linter ESLint |
| `npm test` | Ejecutar tests Jest (83 tests) |
| `npm run cypress` | Abrir Cypress E2E (browser) |
| `npm run cypress:run` | Ejecutar Cypress headless |
| `npm run test:e2e` | Abrir Cypress |
| `npm run validate` | Lint + TypeScript + Tests + Build |
| `npm run docker:build` | Construir imagen Docker |
| `npm run docker:compose` | Levantar con Docker Compose |

### CI/CD

GitHub Actions ejecuta automaticamente en cada push/PR:

1. **CI:** Lint + TypeScript + Jest tests + Build
2. **Docker:** Build multi-stage + push a GitHub Container Registry (GHCR)

### Estructura del Proyecto

```
goltv-libre/
  src/
    app/                    # Rutas y paginas (App Router)
      api/                  # Endpoints API (matches, chat, health, leagues, standings, og)
      leagues/              # Tablas de posiciones por liga
      watch/[matchId]/      # Pagina del reproductor
      sitemap.ts            # Sitemap XML dinamico
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
    __tests__/              # Tests unitarios y de API routes (Jest)
  cypress/                  # Tests E2E (Cypress)
    e2e/                    # Specs: home, navigation, search, leagues, responsive...
  public/                   # Iconos, robots.txt, manifest.json
  .github/workflows/        # CI/CD (GitHub Actions)
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
- 15 leagues covered: Liga Profesional, Copa Argentina, Brasileirao Serie A, Copa do Brasil, Liga AUF Uruguaya, Copa Libertadores, Copa Sudamericana, Champions League, Europa League, La Liga, Premier League, Bundesliga, Serie A Italia, MLS, CONCACAF Champions Cup
- League standings and cup brackets on the leagues page (scraped from Promiedos)
- Real-time statuses: Live, Upcoming, Finished with scores and timers
- Integrated HLS player with channel selector and reload
- Live chat per match with smart scroll (auto-scrolls near the bottom, lets you read if you scrolled up)
- Team search in the header
- Team logos via TheSportsDB with fuzzy matching and aliases
- Date navigation to view matches from other days
- Auto-refresh of scores every 30 seconds when there are live matches
- Scroll restoration: preserves your position when navigating back from a match
- Open Graph meta tags + dynamic OG images for sharing links on social media
- Dynamic XML sitemap, robots.txt and manifest.json (PWA-ready)
- Bilingual (Spanish / English) with dynamic toggle
- Custom logo as favicon

### Tech Stack

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Video:** Hls.js
- **Icons:** Lucide React
- **Testing:** Jest 30, React Testing Library, Cypress 16
- **CI/CD:** GitHub Actions
- **Containerization:** Docker, Docker Compose

### Data Sources

- **FutbolLibre:** Primary source. Static JSON on Bunny CDN (Strapi v4), match parsing, embed resolution. 30 min cache
- **PelotaLibre:** Secondary source. HTML agenda scraping, multiple sources per match. 30 min cache
- **API-Football (API-Sports):** Fixtures, leagues, crests, scores. Multi-key rotation, ~70 calls/key/day limit, 90s-2min cache
- **RapidAPI (football-live-stream-api):** Live matches and HLS URLs. ~35 calls/day limit, 5-10 min cache
- **Promiedos:** League standings and cup brackets. __NEXT_DATA__ scraping. 10 min cache
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
| FutbolLibre | No fixed limit | agenda ~30min |
| PelotaLibre | 300 calls/day | agenda revalidates ~5min, streams ~30min |

- Do not loop `npm run test:streams`
- After a 429, wait at least 5 minutes (automatic cooldown)

### Testing

| Type | Tests | Description |
|------|-------|-------------|
| Unit (Jest) | 49 | Constants, utilities, streaming, types, API routes |
| API Routes (Jest) | 34 | matches, match-by-id, standings, leagues, chat, health |
| E2E (Cypress) | 32 | Home, navigation, search, leagues, responsive, language |
| **Total** | **115** | **Full stack coverage** |

```bash
npm test                          # 83 Jest tests
npx cypress run                   # 32 E2E tests
npm run validate                  # Lint + TypeScript + Jest + Build
```

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint linter |
| `npm test` | Run Jest tests (83 tests) |
| `npm run cypress` | Open Cypress E2E (browser) |
| `npm run cypress:run` | Run Cypress headless |
| `npm run test:e2e` | Open Cypress |
| `npm run validate` | Lint + TypeScript + Tests + Build |
| `npm run docker:build` | Build Docker image |
| `npm run docker:compose` | Start with Docker Compose |

### CI/CD

GitHub Actions runs automatically on every push/PR:

1. **CI:** Lint + TypeScript + Jest tests + Build
2. **Docker:** Multi-stage build + push to GitHub Container Registry (GHCR)

### Project Structure

```
goltv-libre/
  src/
    app/                    # Routes and pages (App Router)
      api/                  # API endpoints (matches, chat, health, leagues, standings, og)
      leagues/              # League standings page
      watch/[matchId]/      # Player page
      sitemap.ts            # Dynamic XML sitemap
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
    __tests__/              # Unit and API route tests (Jest)
  cypress/                  # E2E tests (Cypress)
    e2e/                    # Specs: home, navigation, search, leagues, responsive...
  public/                   # Icons, robots.txt, manifest.json
  .github/workflows/        # CI/CD (GitHub Actions)
  Dockerfile                # Multi-stage build
  docker-compose.yml        # Container orchestration
  package.json              # Dependencies and scripts
```

### Legal Disclaimer

GolTV Libre is an educational and technical demonstration project. The platform does not host any video content on its servers and only links to publicly accessible third-party streams on the internet.
