export function resolveApiUrl(input: { configured?: string; host?: string; isRelease?: boolean } = {}) {
  const configured = input.configured?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (input.isRelease) {
    throw new Error("EXPO_PUBLIC_API_URL doit être définie pour une build de production.");
  }
  const host = input.host?.trim();
  if (host && host !== "localhost" && host !== "127.0.0.1") return `http://${host}:9070`;
  return "http://127.0.0.1:9070";
}
