import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "@/lib/db";
import { CHALLENGE_COOKIE, SESSION_TTL_SECONDS } from "@/lib/auth/crypto";
import { completeAuth } from "@/lib/auth/service";
import { clientAddress } from "@/lib/auth/rate-limit";
import { hasValidOrigin } from "@/lib/auth/http";

export const { handlers, auth, signOut } = NextAuth({
  trustHost: true, // L’origine des mutations est contrôlée contre AUTH_URL / APP_URL.
  pages: { signIn: "/connexion" },
  session: { strategy: "jwt", maxAge: SESSION_TTL_SECONDS },
  providers: [Credentials({
    credentials: { code: { label: "Code à six chiffres", type: "text" } },
    async authorize(credentials, request) {
      if (!hasValidOrigin(request)) return null;
      const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(`${CHALLENGE_COOKIE}=`));
      const token = cookie?.slice(CHALLENGE_COOKIE.length + 1) || "";
      try { return await completeAuth(token, credentials.code, clientAddress(request)); }
      catch { return null; }
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sessionId = user.sessionId;
      if (typeof token.sessionId !== "string") return null;
      const record = await getDb().authSession.findUnique({ where: { id: token.sessionId } });
      if (!record || record.expiresAt.getTime() <= Date.now() || record.userId !== token.sub) return null;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub!;
      return session;
    },
  },
  events: {
    async signOut(message) {
      if ("token" in message && typeof message.token?.sessionId === "string") {
        await getDb().authSession.deleteMany({ where: { id: message.token.sessionId } });
      }
    },
  },
});
