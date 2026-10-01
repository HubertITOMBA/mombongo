export const sessionKeys = {
  access: "mombongo.access",
  refresh: "mombongo.refresh",
  organization: "mombongo.organization",
} as const;

export const legacySessionKeys = {
  access: "facturia.access",
  refresh: "facturia.refresh",
  organization: "facturia.organization",
} as const;

export type TokenStore = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

async function storeCall<T>(key: string, task: () => Promise<T>) {
  try {
    return await task();
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    throw new Error(`SecureStore (${key}) : ${message}`);
  }
}

export async function readWithMigration(store: TokenStore, currentKey: string, legacyKey: string) {
  const current = await storeCall(currentKey, () => store.getItemAsync(currentKey));
  if (current) return current;
  const legacy = await storeCall(legacyKey, () => store.getItemAsync(legacyKey));
  if (!legacy) return null;
  await storeCall(currentKey, () => store.setItemAsync(currentKey, legacy));
  const verified = await storeCall(currentKey, () => store.getItemAsync(currentKey));
  if (verified === legacy) await storeCall(legacyKey, () => store.deleteItemAsync(legacyKey));
  return verified ?? legacy;
}

export async function writeMigrated(store: TokenStore, currentKey: string, legacyKey: string, value: string) {
  await storeCall(currentKey, () => store.setItemAsync(currentKey, value));
  await storeCall(legacyKey, () => store.deleteItemAsync(legacyKey));
}

export async function clearMigrated(store: TokenStore, currentKey: string, legacyKey: string) {
  await Promise.all([
    storeCall(currentKey, () => store.deleteItemAsync(currentKey)),
    storeCall(legacyKey, () => store.deleteItemAsync(legacyKey)),
  ]);
}
