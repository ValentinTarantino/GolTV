# Escudos de equipos

El catálogo `src/data/team-badges.json` registra país, nombres alternativos,
URL de procedencia y archivo local de cada club. La aplicación lo consulta antes
de buscar imágenes externas. Los PNG se incluyen en `public/badges` y en el despliegue;
no necesitan una API externa para mostrarse.

Para incorporar un equipo:

1. Verificar el club y su país en la fuente; registrar su URL y sus nombres en el catálogo.
2. Ejecutar `npm run sync:badges -- "Nombre del club"` para descargarlo.
3. Ejecutar `npm run sync:badges -- --check` y `npm run validate`.
4. Incluir tanto el catálogo como los PNG nuevos en el cambio.

`npm run sync:badges` descarga los archivos ausentes del catálogo completo.
`--refresh` actualiza los ya descargados. `--check` valida los archivos sin acceso
a Internet. El script comprueba la firma y las dimensiones PNG, e informa errores
en vez de guardar HTML o un SVG como PNG.

No agregar abreviaturas ambiguas sin país. Por ejemplo, Barcelona de España y
Barcelona SC de Ecuador tienen entradas diferentes. Las pruebas comprueban que
todos los nombres del catálogo se resuelvan sin red y tengan un archivo válido.

La resolución síncrona (`peekTeamLogo`) y la asíncrona (`getTeamLogo`) comparten
el mismo catálogo. Los clubes todavía no catalogados conservan las fuentes
externas existentes. Los errores de red no se guardan como resultados negativos.
