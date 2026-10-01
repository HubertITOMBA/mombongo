import { config } from "dotenv";
config({ path: ".env" });
config({ path: "apps/web/.env.local" });
const { purgeDemoDataset } = await import("../apps/web/src/lib/demo/purge.ts");
const { DEMO_DATASET_KEY } = await import("../apps/web/src/lib/demo/guard.ts");
const { getDb } = await import("../apps/web/src/lib/db.ts");
try {
  const summary = await purgeDemoDataset(DEMO_DATASET_KEY);
  console.log(JSON.stringify({
    ok: true,
    commande: "db:purge:demo",
    ...summary,
  }, null, 2));
} finally {
  await getDb().$disconnect();
}
