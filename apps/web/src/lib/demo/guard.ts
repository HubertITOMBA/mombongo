export const DEMO_DATASET_KEY = "mombongo-demo";
export const DEMO_PASSWORD = "motdepasse";

export function assertDemoMutationsAllowed() {
  const flags = [process.env.NODE_ENV, process.env.VERCEL_ENV, process.env.MOMBONGO_ENV];
  if (flags.some(value => value === "production")) {
    throw new Error("Les commandes de fixtures DEMO sont interdites en production (NODE_ENV, VERCEL_ENV ou MOMBONGO_ENV).");
  }
}
