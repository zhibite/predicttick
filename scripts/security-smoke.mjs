#!/usr/bin/env node
/**
 * Local/staging security smoke test:
 * - IDOR on strategies, runs and API keys between two accounts
 * - per-key rate limiting (429)
 * - basic health endpoint latency under concurrency
 *
 * Usage:
 *   BASE_URL=http://127.0.0.1:3112 \
 *   APP_DB_PATH=data/test-p5/app.sqlite \
 *   TEST_FROM=2026-10-31 TEST_TO=2026-11-01 \
 *   node scripts/security-smoke.mjs
 */
import { DatabaseSync } from "node:sqlite";

const BASE_URL = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const APP_DB_PATH =
  process.env.APP_DB_PATH ??
  process.env.POLY_APP_DB_PATH ??
  "data/app/app.sqlite";
const TEST_FROM = process.env.TEST_FROM ?? "2026-10-31";
const TEST_TO = process.env.TEST_TO ?? "2026-11-01";
const stamp = Date.now();

const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`[pass] ${name}`);
  } else {
    failures.push(name);
    console.error(`[fail] ${name}${detail ? `: ${detail}` : ""}`);
  }
}

function cookieFrom(response) {
  const cookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      ...(options.headers ?? {}),
    },
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { response, body };
}

async function register(email) {
  const { response, body } = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email,
      password: "password123",
      name: email.split("@")[0],
    }),
  });
  if (!response.ok) throw new Error(`register ${email}: ${JSON.stringify(body)}`);
  return cookieFrom(response);
}

function seedAccess(email) {
  const db = new DatabaseSync(APP_DB_PATH);
  const user = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(email);
  if (!user) throw new Error(`user not found: ${email}`);
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO user_access (user_id, plan_code, access_until, updated_at)
     VALUES (?, 'pro_30', ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       plan_code = 'pro_30', access_until = excluded.access_until,
       updated_at = excluded.updated_at`,
  ).run(user.id, now + 30 * 86_400, now);
  db.close();
  return user.id;
}

const emailA = `security-a-${stamp}@example.com`;
const emailB = `security-b-${stamp}@example.com`;
const cookieA = await register(emailA);
const cookieB = await register(emailB);
seedAccess(emailA);
seedAccess(emailB);

const source = `const meta = { mode: "point", decisionBeforeEnd: 60 };
function onWindow(ctx) { return null; }`;

const strategy = await request("/api/backtest/strategies", {
  method: "POST",
  headers: { Cookie: cookieA },
  body: JSON.stringify({ name: "idor", source, params: {} }),
});
check("A can create strategy", strategy.response.status === 201);
const strategyId = strategy.body?.strategy?.id;

const otherGet = await request(`/api/backtest/strategies/${strategyId}`, {
  headers: { Cookie: cookieB },
});
const otherPut = await request(`/api/backtest/strategies/${strategyId}`, {
  method: "PUT",
  headers: { Cookie: cookieB },
  body: JSON.stringify({ source, params: {} }),
});
const otherDelete = await request(`/api/backtest/strategies/${strategyId}`, {
  method: "DELETE",
  headers: { Cookie: cookieB },
});
check("B cannot read A strategy", otherGet.response.status === 404);
check("B cannot update A strategy", otherPut.response.status === 404);
check("B cannot delete A strategy", otherDelete.response.status === 404);

const key = await request("/api/account/api-keys", {
  method: "POST",
  headers: { Cookie: cookieA },
  body: JSON.stringify({ name: "smoke" }),
});
check("A can create API key", key.response.status === 201);
const keyId = key.body?.key?.id;
const keyToken = key.body?.token;
const otherKeyDelete = await request(`/api/account/api-keys/${keyId}`, {
  method: "DELETE",
  headers: { Cookie: cookieB },
});
check("B cannot revoke A API key", otherKeyDelete.response.status === 404);

const run = await request("/api/backtest/runs", {
  method: "POST",
  headers: { Cookie: cookieA },
  body: JSON.stringify({
    asset: "btc",
    period: "5m",
    from: TEST_FROM,
    to: TEST_TO,
    resolvedOnly: true,
    params: {},
    source,
  }),
});
check("A can create run", run.response.status === 201);
const runId = run.body?.run?.id;
const otherRun = await request(`/api/backtest/runs/${runId}`, {
  headers: { Cookie: cookieB },
});
check("B cannot read A run", otherRun.response.status === 404);

const db = new DatabaseSync(APP_DB_PATH);
db.prepare("UPDATE api_keys SET rate_limit_per_min = 5 WHERE id = ?").run(keyId);
db.close();

let rateLimited = false;
for (let index = 0; index < 6; index += 1) {
  const response = await fetch(`${BASE_URL}/api/v1/me`, {
    headers: { Authorization: `Bearer ${keyToken}` },
  });
  if (response.status === 429) {
    rateLimited = true;
    break;
  }
}
check("API key rate limit returns 429", rateLimited);

const latencies = [];
let healthFailures = 0;
const load = Array.from({ length: 50 }, async () => {
  const start = performance.now();
  const response = await fetch(`${BASE_URL}/api/v1/health`);
  latencies.push(performance.now() - start);
  if (!response.ok) healthFailures += 1;
});
await Promise.all(load);
latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)];
const p95 = latencies[Math.floor(latencies.length * 0.95)];
check("health load has no failures", healthFailures === 0);
console.log(
  `[info] health 50 requests: p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms`,
);

console.log(
  `\n${failures.length === 0 ? "SECURITY SMOKE PASS" : `SECURITY SMOKE FAIL (${failures.length})`}`,
);
process.exit(failures.length === 0 ? 0 : 1);
