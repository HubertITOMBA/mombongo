import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { buildAppUrl, getAppUrl, getAuthOrigin } from "../apps/web/src/lib/app-url";
import { sendCode, sendInvitation, sendPasswordReset } from "../apps/web/src/lib/auth/mail";
import { hasValidOrigin } from "../apps/web/src/lib/auth/http";
import { resolveApiUrl } from "../apps/mobile/src/api-url";

const mailDir = path.resolve(`.local/test-mail/r2-${randomUUID()}`);
const previous = {
  APP_URL: process.env.APP_URL,
  AUTH_URL: process.env.AUTH_URL,
  NODE_ENV: process.env.NODE_ENV,
  MAIL_TRANSPORT: process.env.MAIL_TRANSPORT,
  LOCAL_MAIL_DIR: process.env.LOCAL_MAIL_DIR,
};

before(async () => {
  process.env.MAIL_TRANSPORT = "local";
  process.env.LOCAL_MAIL_DIR = mailDir;
  await mkdir(mailDir, { recursive: true, mode: 0o700 });
});

after(async () => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await rm(mailDir, { recursive: true, force: true });
});

function setPublicUrl(appUrl?: string, authUrl?: string) {
  if (appUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = appUrl;
  if (authUrl === undefined) delete process.env.AUTH_URL;
  else process.env.AUTH_URL = authUrl;
}

describe("R2 URLs publiques et emails", { concurrency: false }, () => {
test("APP_URL locale construit les liens d’invitation et de reset", () => {
  setPublicUrl("http://localhost:9070");
  process.env.NODE_ENV = "test";
  assert.equal(getAppUrl(), "http://localhost:9070");
  assert.equal(buildAppUrl("/invitation", "abc.token"), "http://localhost:9070/invitation#abc.token");
  assert.equal(buildAppUrl("/reinitialiser-mot-de-passe", "xyz.token"), "http://localhost:9070/reinitialiser-mot-de-passe#xyz.token");
});

test("APP_URL de production construit les liens mombongo.fr", () => {
  setPublicUrl("https://mombongo.fr");
  process.env.NODE_ENV = "test";
  assert.equal(getAppUrl(), "https://mombongo.fr");
  assert.equal(buildAppUrl("/invitation", "abc.token"), "https://mombongo.fr/invitation#abc.token");
  assert.equal(buildAppUrl("/reinitialiser-mot-de-passe", "xyz.token"), "https://mombongo.fr/reinitialiser-mot-de-passe#xyz.token");
});

test("AUTH_URL sert de repli et l’origine auth reste distincte si les deux sont posées", () => {
  setPublicUrl(undefined, "http://localhost:9070");
  process.env.NODE_ENV = "test";
  assert.equal(getAppUrl(), "http://localhost:9070");
  setPublicUrl("https://mombongo.fr", "http://localhost:9070");
  assert.equal(getAppUrl(), "https://mombongo.fr");
  assert.equal(getAuthOrigin(), "http://localhost:9070");
  assert.equal(hasValidOrigin(new Request("http://localhost:9070/api/v1/auth/login", { headers: { origin: "http://localhost:9070" } })), true);
  assert.equal(hasValidOrigin(new Request("https://mombongo.fr/api/v1/auth/login", { headers: { origin: "https://mombongo.fr" } })), false);
});

test("en production, localhost et les IP privées sont refusés", () => {
  const env = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  setPublicUrl("http://localhost:9070");
  assert.throws(() => getAppUrl(), /https/);
  setPublicUrl("https://127.0.0.1");
  assert.throws(() => getAppUrl(), /privé|localhost/i);
  setPublicUrl("https://192.168.1.126:9070");
  assert.throws(() => getAppUrl(), /privé|localhost/i);
  setPublicUrl("https://mombongo.fr");
  assert.equal(getAppUrl(), "https://mombongo.fr");
  process.env.NODE_ENV = env;
});

test("les emails locaux portent la marque Mombongo et les URLs APP_URL", async () => {
  setPublicUrl("https://mombongo.fr");
  process.env.NODE_ENV = "test";
  await sendCode("code@example.test", "123456", "challenge-r2", 1);
  await sendInvitation("invite@example.test", "Atelier Test", "invite-id.invite-secret", "invite-r2");
  await sendPasswordReset("reset@example.test", "reset-id.reset-secret", "reset-r2");
  const files = await readdir(mailDir);
  const mails = await Promise.all(files.map(async file => JSON.parse(await readFile(path.join(mailDir, file), "utf8"))));
  assert.equal(mails.length, 3);
  for (const mail of mails) {
    assert.match(mail.subject, /Mombongo/);
    assert.doesNotMatch(mail.subject, /facturia/i);
    assert.doesNotMatch(mail.text, /facturia/i);
    assert.doesNotMatch(mail.text, /f@cturia/i);
    assert.ok(!("from" in mail) || !/facturia/i.test(String(mail.from)));
  }
  const code = mails.find(mail => mail.to === "code@example.test")!;
  const invite = mails.find(mail => mail.to === "invite@example.test")!;
  const reset = mails.find(mail => mail.to === "reset@example.test")!;
  assert.match(code.text, /code Mombongo : 123456/);
  assert.match(invite.text, /https:\/\/mombongo\.fr\/invitation#invite-id\.invite-secret/);
  assert.match(reset.text, /https:\/\/mombongo\.fr\/reinitialiser-mot-de-passe#reset-id\.reset-secret/);
  assert.doesNotMatch(invite.text, /localhost|127\.0\.0\.1|192\.168\./);
  assert.doesNotMatch(reset.text, /localhost|127\.0\.0\.1|192\.168\./);
});

test("le baseURL mobile suit EXPO_PUBLIC_API_URL, le LAN en dev, et exige l’env en release", () => {
  assert.equal(resolveApiUrl({ configured: "https://mombongo.fr/" }), "https://mombongo.fr");
  assert.equal(resolveApiUrl({ host: "192.168.1.126" }), "http://192.168.1.126:9070");
  assert.equal(resolveApiUrl({ host: "localhost" }), "http://127.0.0.1:9070");
  assert.equal(resolveApiUrl({}), "http://127.0.0.1:9070");
  assert.throws(() => resolveApiUrl({ isRelease: true }), /EXPO_PUBLIC_API_URL/);
});
});
