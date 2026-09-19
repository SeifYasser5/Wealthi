/**
 * The backend half of the Playwright stack, started by playwright.config.ts:
 * a throwaway Postgres (or TEST_DATABASE_URL), the Prisma schema, the synthetic
 * fixture ledger, then the real API on 127.0.0.1:3100. Never touches your dev
 * database, config or patterns: everything points at backend/test/fixtures.
 */
import { execFileSync, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";

const backend = resolve(dirname(fileURLToPath(import.meta.url)), "../backend");
export const API_PORT = 3100;

let container;
let url = process.env.TEST_DATABASE_URL;
if (!url) {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("wealthi_test")
    .start();
  url = container.getConnectionUri();
}
// Same rule as the Vitest suite: the seed wipes tables, so only a *_test database.
if (!new URL(url).pathname.endsWith("_test")) {
  console.error(
    `[e2e] refusing database "${new URL(url).pathname.slice(1)}": its name must end in "_test"`,
  );
  process.exit(1);
}

const env = {
  ...process.env,
  DATABASE_URL: url,
  WEALTHI_CONFIG_PATH: resolve(backend, "test/fixtures/wealthi.test.json"),
  WEALTHI_PATTERNS_DIR: resolve(backend, "test/fixtures/patterns"),
  TZ: "UTC",
};

execFileSync("npx", ["prisma", "db", "push"], {
  cwd: backend,
  env,
  stdio: "pipe",
});
execFileSync(
  "npx",
  ["ts-node", "-P", "test/e2e/tsconfig.json", "test/e2e/seed.ts"],
  { cwd: backend, env, stdio: "inherit" },
);

// IMESSAGE_DB_PATH points nowhere so the server skips its own start-up import.
// Started the way `npm run dev` starts it.
const server = spawn("npx", ["ts-node", "src/server.ts"], {
  cwd: backend,
  env: {
    ...env,
    PORT: String(API_PORT),
    HOST: "127.0.0.1",
    IMESSAGE_DB_PATH: resolve(backend, "test/e2e/no-chat.db"),
  },
  stdio: "inherit",
});

async function shutdown(code = 0) {
  server.kill();
  await container?.stop();
  process.exit(code);
}
server.on("exit", (code) => shutdown(code ?? 1));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => shutdown(0));
