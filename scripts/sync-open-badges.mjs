import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// The app consumes this same catalog. Never guess clubs from substrings of
// repository filenames or save SVG bytes under a .png extension.
const catalog = JSON.parse(await readFile("src/data/team-badges.json", "utf8"));
const normalize = (value) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
const args = process.argv.slice(2);
const check = args.includes("--check");
const refresh = args.includes("--refresh");
const names = args.filter((arg) => !arg.startsWith("--"));
const selected = names.length ? catalog.filter((entry) => entry.names.some((name) => names.some((arg) => normalize(arg) === normalize(name)))) : catalog;
if (!selected.length) throw new Error("Add a verified club, country and source to src/data/team-badges.json first.");
const base = path.resolve("public", "badges");
await mkdir(base, { recursive: true });

function validatePng(data) {
  if (data.length < 24 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || data.toString("ascii", 12, 16) !== "IHDR" || data.readUInt32BE(16) < 16 || data.readUInt32BE(20) < 16) {
    throw new Error("Expected a real PNG crest, not HTML or an empty image");
  }
}

let failures = 0;
let cursor = 0;
let complete = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < selected.length) {
    const entry = selected[cursor++];
    try {
      const file = path.resolve("public", `.${entry.file}`);
      if (!file.startsWith(base + path.sep) || !file.endsWith(".png")) throw new Error("Invalid catalog path");
      let valid = false;
      try { validatePng(await readFile(file)); valid = true; } catch { /* download below */ }
      if (check && !valid) throw new Error("Missing or invalid local crest");
      if (!check && (!valid || refresh)) {
        const response = await fetch(entry.source, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        validatePng(bytes);
        await writeFile(file, bytes);
      }
      complete++;
    } catch (error) {
      failures++;
      console.error(`${entry.names[0]} (${entry.country}): ${error.message}`);
    }
  }
}));
console.log(`${complete}/${selected.length} local crests verified; ${failures} failures.`);
if (failures) process.exitCode = 1;
