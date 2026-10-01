import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
const exists = async file => access(file).then(() => true, () => false);
await mkdir(".local", { recursive: true, mode: 0o700 });
const passwordPath = ".local/postgres-password";
if (!(await exists(passwordPath))) {
  if (await exists(".env") || await exists("apps/web/.env.local")) {
    throw new Error("Une configuration existe déjà. Configurez la base manuellement afin de ne pas remplacer vos paramètres.");
  }
  await writeFile(passwordPath, randomBytes(32).toString("base64url") + "\n", { mode: 0o600, flag: "wx" });
}
const password = (await readFile(passwordPath, "utf8")).trim();
const url = `postgresql://facturia:${password}@127.0.0.1:5433/facturia?schema=public`;
if (!(await exists(".env"))) await writeFile(".env", `DATABASE_URL="${url}"\n`, { mode: 0o600, flag: "wx" });
if (!(await exists("apps/web/.env.local"))) {
  const value = `DATABASE_URL="${url}"\nAUTH_SECRET="${randomBytes(48).toString("base64url")}"\nAPP_URL="http://localhost:9070"\nAUTH_URL="http://localhost:9070"\nMAIL_TRANSPORT="local"\nLOCAL_MAIL_DIR="${path.resolve(".local/mail")}"\n`;
  await writeFile("apps/web/.env.local", value, { mode: 0o600, flag: "wx" });
}
