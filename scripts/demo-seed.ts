import { config } from "dotenv";
config({ path: ".env" });
config({ path: "apps/web/.env.local" });
const { seedDemoDataset, DEMO_DATASET_KEY } = await import("../apps/web/src/lib/demo/seed.ts");
const { getDb } = await import("../apps/web/src/lib/db.ts");
try {
  const summary = await seedDemoDataset(DEMO_DATASET_KEY);
  console.log(JSON.stringify({
    ok: true,
    commande: "db:seed:demo",
    ...summary,
    motDePasseUtilisateurs: "motdepasse",
    envoiEmail: "aucun e-mail n’a été envoyé pendant le seed",
  }, null, 2));
} finally {
  await getDb().$disconnect();
}
