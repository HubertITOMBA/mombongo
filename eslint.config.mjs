import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: { rootDir: "apps/web/" },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["apps/web/src/components/auth/password-recovery-form.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "apps/web/.next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "apps/web/next-env.d.ts",
    "apps/web/src/generated/**",
    "node_modules/**",
    ".local/**",
    "SAVES/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
