import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const files = {
  regular: "LiberationSans-Regular.ttf",
  bold: "LiberationSans-Bold.ttf",
} as const;

function fontCandidates(filename: string) {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "fonts", filename),
    join(process.cwd(), "src/lib/pdf/fonts", filename),
    join(process.cwd(), "apps/web/src/lib/pdf/fonts", filename),
  ];
}

export function readPdfFont(weight: keyof typeof files) {
  const filename = files[weight];
  const path = fontCandidates(filename).find(candidate => existsSync(candidate));
  if (!path) throw new Error(`Police PDF introuvable : ${filename}`);
  return readFileSync(path);
}
