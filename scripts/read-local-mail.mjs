import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
// Commande volontaire du développeur : jamais un endpoint public ni un log du serveur.
const directory = path.resolve(".local/mail");
try {
  const files = (await readdir(directory)).filter(name => name.endsWith(".json"));
  const emails = await Promise.all(files.map(async file => JSON.parse(await readFile(path.join(directory, file), "utf8"))));
  const latest = emails.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!latest) console.log("Aucun email local. Commencez par une inscription ou une connexion.");
  else console.log(`À : ${latest.to}\nDate : ${latest.createdAt}\n${latest.subject}\n\n${latest.text}`);
} catch (error) {
  if (error.code === "ENOENT") console.log("Aucun email local. Commencez par une inscription ou une connexion.");
  else throw error;
}
