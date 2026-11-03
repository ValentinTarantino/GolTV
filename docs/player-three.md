# Reproductor 3

`src/lib/secondary-source.ts` obtiene la tabla de partidos de la nueva agenda,
agrupa sus enlaces de canal y resuelve los iframes intermedios desde el servidor.
La API existente (`player=3`) devuelve los reproductores como `kind: "iframe"`.

Configurar en `.env.local` y en las variables del servidor de producción:

```dotenv
SECONDARY_AGENDA_URL=https://agenda.example/index.php
SECONDARY_PLAYER_WRAPPER_HOSTS=wrapper.example,www.wrapper.example
SECONDARY_MLS_SCHEDULE_URL=https://schedule.example/scoreboard
```

Usar la URL real de la agenda y los hosts exactos de sus páginas intermedias.
El host de la agenda ya está permitido. No añadir el host del reproductor final:
ese iframe lo carga el navegador. Los valores reales no se guardan en Git.
`SECONDARY_EVENT_BASE` ya no se utiliza; no hay proveedor predeterminado.

- Se descartan enlaces promocionales externos, deportes excluidos y señales repetidas.
- La agenda no publica fecha ni zona horaria verificables: sus registros sirven
  para buscar señales. Los encuentros de MLS pueden generar tarjetas cuando
  `SECONDARY_MLS_SCHEDULE_URL` confirma ambos equipos y un horario con zona
  horaria. Este endpoint debe devolver un scoreboard compatible con ESPN y
  aceptar `dates=YYYYMMDD`. Se consultan el día argentino actual y el anterior
  por los partidos nocturnos de Estados Unidos. El estado confirmado evita
  mostrar como en vivo partidos terminados, postergados o cancelados.
  Sin confirmación, no se inventa una fecha y se conserva la búsqueda de señales.
- La resolución tiene un máximo de cuatro páginas intermedias y 20 segundos.
  No sigue redirecciones HTTP. Si cambia la estructura o el host intermedio,
  revisar el proveedor y actualizar configuración/parser.
- Agenda y resoluciones exitosas se almacenan cinco minutos. Un canal fallido
  no elimina las otras opciones ni queda cacheado como fallo.
- El calendario de MLS se almacena un minuto y tolera fallos sin impedir
  resolver los reproductores.
- Encontrar un iframe no verifica que su emisión esté activa; la disponibilidad
  de video depende del proveedor externo.
