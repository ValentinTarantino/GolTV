import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const names = process.argv.slice(2).filter(Boolean);
if (!names.length) process.exit(1);
const outDir = path.resolve("public", "badges");
await mkdir(outDir, { recursive: true });
const slugify = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
for (const name of names) {
  const needle = slugify(name).replaceAll("-", "");
  const tree = await fetch("https://api.github.com/repos/JoseArroyave/football-logos/git/trees/main?recursive=1", { headers: { "User-Agent": "goltv-libre-badge-sync" } });
  if (!tree.ok) { console.warn(`${name}: GitHub returned ${tree.status}`); continue; }
  const files = (await tree.json()).tree ?? [];
  const match = files.find((item) => item.type === "blob" && /\.(svg|png)$/i.test(item.path) && slugify(item.path).replaceAll("-", "").includes(needle));
  if (!match) { console.warn(`${name}: no open repository match`); continue; }
  const image = await fetch(`https://raw.githubusercontent.com/JoseArroyave/football-logos/main/${match.path}`);
  if (!image.ok) continue;
  const file = path.join(outDir, `${slugify(name)}.png`);
  await writeFile(file, Buffer.from(await image.arrayBuffer()));
  console.log(`${name} -> ${file}`);
}
