import * as SecureStore from "expo-secure-store";
import { clearMigrated, legacySessionKeys, readWithMigration, sessionKeys, writeMigrated } from "./migrate-store";

export async function readSession() {
  const [accessToken, refreshToken] = await Promise.all([
    readWithMigration(SecureStore, sessionKeys.access, legacySessionKeys.access),
    readWithMigration(SecureStore, sessionKeys.refresh, legacySessionKeys.refresh),
  ]);
  if (!accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}

export async function writeSession(accessToken: string, refreshToken: string) {
  await writeMigrated(SecureStore, sessionKeys.access, legacySessionKeys.access, accessToken);
  await writeMigrated(SecureStore, sessionKeys.refresh, legacySessionKeys.refresh, refreshToken);
}

export async function readActiveOrganization() {
  return readWithMigration(SecureStore, sessionKeys.organization, legacySessionKeys.organization);
}

export async function writeActiveOrganization(organizationId: string) {
  await writeMigrated(SecureStore, sessionKeys.organization, legacySessionKeys.organization, organizationId);
}

export async function clearActiveOrganization() {
  await clearMigrated(SecureStore, sessionKeys.organization, legacySessionKeys.organization);
}

export async function clearSession() {
  await Promise.all([
    clearMigrated(SecureStore, sessionKeys.access, legacySessionKeys.access),
    clearMigrated(SecureStore, sessionKeys.refresh, legacySessionKeys.refresh),
    clearMigrated(SecureStore, sessionKeys.organization, legacySessionKeys.organization),
  ]);
}
