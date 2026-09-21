import { gzipSync } from "node:zlib";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(root, "dist/embed.js");

if (!existsSync(file)) {
  console.error("Missing dist/embed.js — run `pnpm --filter @shedflow/embed build` first.");
  process.exit(1);
}

const raw = readFileSync(file);
const gz = gzipSync(raw);
const limit = 8 * 1024;

console.log(`embed.js  raw=${raw.length} B  gzip=${gz.length} B  limit=${limit} B`);
if (gz.length >= limit) {
  console.error("FAIL: gzip size exceeds 8 KB target.");
  process.exit(1);
}
console.log("OK: under 8 KB gzip.");
