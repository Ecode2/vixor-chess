// Copies the Stockfish WASM engine (lite, single-threaded: ~7MB, no special
// headers needed) from node_modules into /public so it is served statically.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "stockfish");
const dest = join(root, "public", "engines");
const files = [
  ["bin/stockfish-18-lite-single.js", "stockfish-18-lite-single.js"],
  ["bin/stockfish-18-lite-single.wasm", "stockfish-18-lite-single.wasm"],
  ["Copying.txt", "STOCKFISH-LICENSE.txt"],
];

if (!existsSync(src)) {
  console.warn("[copy-engine] stockfish package not installed - engine will be unavailable");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
for (const [from, to] of files) copyFileSync(join(src, from), join(dest, to));
console.log("[copy-engine] Stockfish copied to public/engines");
