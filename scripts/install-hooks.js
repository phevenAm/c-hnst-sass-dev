import { chmodSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "../..");
const src = join(root, "scripts/hooks");
const dest = join(root, ".git/hooks");

const hooks = ["pre-push"];

for (const hook of hooks) {
  copyFileSync(join(src, hook), join(dest, hook));
  try {
    chmodSync(join(dest, hook), 0o755);
  } catch {
    // Windows — Git reads the executable bit from the script shebang
  }
}

console.log("Git hooks installed.");
