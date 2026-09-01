// One-off: convert the marketing screenshot GIFs to animated WebP with
// Google's gif2webp (sharp's animated pipeline drops frames on this build).
//
// gif2webp-bin is NOT a project dependency — it pulled a fresh binary from a
// remote host on every deploy for a task that runs maybe once a release. Install
// it ad hoc before running this:
//   npm i --no-save gif2webp-bin && node scripts/gif-to-webp.mjs
// (deletes each .gif once converted)
import { execFileSync } from "node:child_process";
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import gif2webpMod from "gif2webp-bin";

const gif2webp = gif2webpMod.default ?? gif2webpMod;
const DIR = "public/screenshots";
const gifs = readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".gif"));

let before = 0;
let after = 0;

for (const gif of gifs) {
  const src = join(DIR, gif);
  const out = join(DIR, gif.replace(/\.gif$/i, ".webp"));
  const inBytes = statSync(src).size;
  before += inBytes;

  execFileSync(gif2webp, ["-q", "72", "-m", "6", "-mt", src, "-o", out], { stdio: "ignore" });

  const outBytes = statSync(out).size;
  after += outBytes;
  unlinkSync(src);
  console.log(
    `${gif.padEnd(30)} ${(inBytes / 1024).toFixed(0).padStart(6)} KB  ->  ${(outBytes / 1024).toFixed(0).padStart(6)} KB`,
  );
}

if (gifs.length) {
  console.log(
    `\nTotal: ${(before / 1024 / 1024).toFixed(1)} MB  ->  ${(after / 1024 / 1024).toFixed(1)} MB  (${Math.round((1 - after / before) * 100)}% smaller)`,
  );
}
