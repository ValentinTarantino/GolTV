# GolTV Libre

[Español](#espanol) | [English](#english)

---

## Espanol

### Descripcion

GolTV Libre es una plataforma web gratuita para consultar partidos de futbol, abrir sus señales disponibles y participar en el chat de cada encuentro. Incluye secciones de partidos, ligas, Canales y LPF Play, con interfaz adaptable a celulares y escritorio, tema neo-brutalista e idiomas español e inglés.

### Funcionalidades

- Agenda de partidos agrupada por competiciones, con marcadores, estados y horarios según la zona horaria elegida.
- Navegación entre fechas, filtros de partidos en vivo, búsqueda de equipos y actualización automática de resultados.
- Páginas de ligas con información de competiciones, posiciones y copas disponibles.
- Página de partido con selección de señales, reproductores HLS e iframe y controles de reproducción.
- Reproductor HLS con selección automática o manual de calidad, recarga y pantalla completa.
- Canales deportivos en HLS o MPEG-DASH, selector de calidad DASH, reproducción a pantalla completa y controles de señal.
- LPF Play con partidos seleccionados, escudos, horarios, estados y señales disponibles.
- Chat por partido con colores personalizables, respuestas a mensajes, historial persistente y moderación.
- Contador de presencia del sitio y de espectadores, con panel de administración para moderar el chat y gestionar bloqueos.
- Diseño de pantalla completa para el reproductor y el chat, optimizado para escritorio y dispositivos móviles.
- Interfaz en español e inglés, búsqueda, navegación adaptable y enlaces para compartir partidos.
- Metadatos Open Graph, imágenes para compartir, sitemap, robots.txt y manifest de la aplicación.

### Tecnologías

- **Framework:** Next.js 16 (App Router)
- **Interfaz:** React 19, TypeScript y Tailwind CSS v4
- **Reproducción:** hls.js y Shaka Player
- **Datos y validación:** APIs de proveedores, Zod y Cheerio
- **Persistencia:** MongoDB Atlas con almacenamiento temporal en memoria como respaldo
- **Iconos:** Lucide React
- **Pruebas:** Jest 30, React Testing Library y Cypress 16
- **Despliegue:** GitHub Actions, Docker y Docker Compose

### Secciones principales

| Ruta | Contenido |
|------|-----------|
| `/` | Agenda, búsqueda, filtros y avisos |
| `/leagues` | Ligas y competiciones |
| `/watch/[matchId]` | Partido, reproductores y chat |
| `/canales` | Canales deportivos en vivo |
| `/lpf` | Partidos y señales de LPF Play |

### Desarrollo

Requiere Node.js y npm. Desde la raíz del proyecto:

```bash


| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia el servidor de desarrollo |
| `npm run build` | Genera el build de producción |
| `npm run start` | Ejecuta el build de producción |
| `npm run lint` | Ejecuta ESLint |
| `npm test` | Ejecuta las pruebas Jest |
| `npm run test:watch` | Ejecuta Jest en modo observación |
| `npm run test:coverage` | Ejecuta Jest con cobertura |
| `npm run cypress` | Abre Cypress |
| `npm run cypress:run` | Ejecuta Cypress en modo headless |
| `npm run test:e2e` | Inicia el servidor y ejecuta las pruebas E2E |
| `npm run validate` | Ejecuta lint, TypeScript, Jest y build |
| `npm run docker:build` | Construye la imagen Docker |
| `npm run docker:run` | Ejecuta el contenedor en el puerto 3000 |
| `npm run docker:compose` | Construye y levanta los servicios con Docker Compose |

### Chat y administración

El chat está asociado a cada partido, conserva los mensajes mediante MongoDB cuando está configurado y usa almacenamiento temporal en memoria como respaldo. Incluye respuestas, colores para nombre y mensaje, e historial limitado. El contador de presencia se actualiza periódicamente.

El panel privado permite administrar la sesión, revisar la presencia, moderar mensajes y gestionar bloqueos. Configura `ADMIN_SECRET` en el entorno de despliegue y evita compartir la ruta del panel o sus credenciales.

### Estructura del proyecto

```text
src/
  app/                 Rutas, páginas y endpoints de la aplicación
    api/               APIs de partidos, chat, reproducción y administración
    canales/           Página de canales deportivos
    leagues/           Página de ligas
    lpf/               Página de LPF Play
    watch/[matchId]/   Página de cada partido
  components/          Interfaz, reproductores, chat y navegación
  contexts/            Estado compartido, incluido el idioma
  i18n/                Diccionarios en español e inglés
  lib/                 Integraciones, modelos y lógica de la aplicación
  __tests__/            Pruebas unitarias y de rutas API
cypress/
  e2e/                 Pruebas de extremo a extremo
public/                Recursos estáticos, iconos y badges
```

### CI y contenedores

GitHub Actions ejecuta las verificaciones del proyecto en los flujos configurados. El repositorio incluye un `Dockerfile` multi-stage y `docker-compose.yml` para construir y ejecutar la aplicación en contenedores.

---

## English

### Description

GolTV Libre is a free web platform for checking football fixtures, opening available streams, and chatting about each match. It includes Matches, Leagues, Channels, and LPF Play sections, with a responsive neo-brutalist interface in Spanish and English.

### Features

- Match schedule grouped by competition, with scores, statuses, and kickoff times in the selected time zone.
- Date navigation, live-only filters, team search, and automatic score refresh.
- League pages with competition information, standings, and available cup brackets.
- Match pages with channel selection, HLS and iframe players, and playback controls.
- HLS player with automatic or manual quality selection, reload, and fullscreen.
- Live sports channels over HLS or MPEG-DASH, DASH quality selection, fullscreen, and channel controls.
- LPF Play fixtures with team crests, kickoff times, statuses, and available streams.
- Per-match chat with customizable colors, replies, persistent history, and moderation.
- Site presence and match viewer counters, with an admin panel for chat moderation and bans.
- Fullscreen layouts for the player and chat, optimized for desktop and mobile.
- Spanish and English UI, search, responsive navigation, and shareable match pages.
- Open Graph metadata, share images, sitemap, robots.txt, and a web app manifest.

### Technology

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19, TypeScript, and Tailwind CSS v4
- **Playback:** hls.js and Shaka Player
- **Data and validation:** Provider APIs, Zod, and Cheerio
- **Persistence:** MongoDB Atlas with an in-memory fallback
- **Icons:** Lucide React
- **Testing:** Jest 30, React Testing Library, and Cypress 16
- **Deployment:** GitHub Actions, Docker, and Docker Compose

### Main sections

| Route | Content |
|-------|---------|
| `/` | Fixtures, search, filters, and notices |
| `/leagues` | Leagues and competitions |
| `/watch/[matchId]` | Match, players, and chat |
| `/canales` | Live sports channels |
| `/lpf` | LPF Play matches and streams |
| `/sixseven` | Private admin panel |

### Development

Node.js and npm are required. From the project root:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the development server |
| `npm run build` | Create the production build |
| `npm run start` | Run the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run Jest tests |
| `npm run test:watch` | Run Jest in watch mode |
| `npm run test:coverage` | Run Jest with coverage |
| `npm run cypress` | Open Cypress |
| `npm run cypress:run` | Run Cypress headlessly |
| `npm run test:e2e` | Start the server and run E2E tests |
| `npm run validate` | Run lint, TypeScript, Jest, and build |
| `npm run docker:build` | Build the Docker image |
| `npm run docker:run` | Run the container on port 3000 |
| `npm run docker:compose` | Build and start services with Docker Compose |

### Chat and administration

Chat is scoped to each match, persists messages in MongoDB when configured, and falls back to in-memory storage when unavailable. It supports replies, separate name and message colors, and bounded message history. The site-wide presence counter updates periodically.

The private admin panel provides session management, presence overview, message moderation, and ban management. Configure `ADMIN_SECRET` in the deployment environment and keep the panel path and credentials private.

### Project structure

```text
src/
  app/                 Application routes, pages, and endpoints
    api/               Match, chat, playback, and admin APIs
    canales/           Sports channels page
    leagues/           Leagues page
    lpf/               LPF Play page
    watch/[matchId]/   Match page
  components/          UI, players, chat, and navigation
  contexts/            Shared state, including language
  i18n/                Spanish and English dictionaries
  lib/                 Integrations, models, and application logic
  __tests__/            Unit and API route tests
cypress/
  e2e/                 End-to-end tests
public/                Static assets, icons, and badges
```

### CI and containers

GitHub Actions runs the configured project checks. The repository includes a multi-stage `Dockerfile` and `docker-compose.yml` for building and running the application in containers.
