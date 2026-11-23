# Escudos de equipos

El catálogo `src/data/team-badges.json` registra país, nombres alternativos,
URL de procedencia y archivo local de cada club. La aplicación lo consulta antes
de buscar imágenes externas. Los PNG se incluyen en `public/badges` y en el despliegue;
no necesitan una API externa para mostrarse.

Para incorporar un equipo:

1. Verificar el club y su país en la fuente; registrar su URL y sus nombres en el catálogo.
2. Descargar el escudo (PNG válido, no HTML ni SVG) a `public/badges` con el nombre registrado.
3. Ejecutar `npm run validate`.
4. Incluir tanto el catálogo como el PNG nuevo en el cambio.

Los tests verifican que cada entrada del catálogo tenga un archivo PNG válido.

No agregar abreviaturas ambiguas sin país. Por ejemplo, Barcelona de España y
Barcelona SC de Ecuador tienen entradas diferentes. Las pruebas comprueban que
todos los nombres del catálogo se resuelvan sin red y tengan un archivo válido.

La resolución síncrona (`peekTeamLogo`) y la asíncrona (`getTeamLogo`) comparten
el mismo catálogo. Los clubes todavía no catalogados conservan las fuentes
externas existentes. Los errores de red no se guardan como resultados negativos.
