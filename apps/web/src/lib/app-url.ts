function readConfiguredUrl() {
  return (process.env.APP_URL?.trim() || process.env.AUTH_URL?.trim() || "");
}

function parsePublicUrl(value: string) {
  if (!value) throw new Error("APP_URL ou AUTH_URL doit être configurée.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("APP_URL/AUTH_URL doit être une URL absolue.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("APP_URL/AUTH_URL doit utiliser http ou https.");
  }
  if (process.env.NODE_ENV === "production") {
    if (parsed.protocol !== "https:") throw new Error("APP_URL/AUTH_URL doit utiliser https en production.");
    if (isLocalOrPrivateHost(parsed.hostname)) {
      throw new Error("APP_URL/AUTH_URL ne peut pas viser localhost ni un réseau privé en production.");
    }
  }
  return parsed.origin;
}

function isLocalOrPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === "localhost"
    || host === "127.0.0.1"
    || host === "::1"
    || /^192\.168\./.test(host)
    || /^10\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

export function getAppUrl() {
  return parsePublicUrl(readConfiguredUrl());
}

export function getAuthOrigin() {
  return parsePublicUrl(process.env.AUTH_URL?.trim() || readConfiguredUrl());
}

export function buildAppUrl(pathname: string, hash?: string) {
  const url = new URL(pathname, `${getAppUrl()}/`);
  if (hash) url.hash = hash;
  return url.toString();
}
