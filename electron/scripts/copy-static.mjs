// Copie les fichiers statiques de l'interface (HTML, CSS, images, polices) vers dist/src/renderer.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src", "renderer");
const out = join(root, "dist", "src", "renderer");
mkdirSync(out, { recursive: true });
cpSync(join(src, "index.html"), join(out, "index.html"));
cpSync(join(src, "styles.css"), join(out, "styles.css"));
cpSync(join(src, "assets"), join(out, "assets"), { recursive: true });
