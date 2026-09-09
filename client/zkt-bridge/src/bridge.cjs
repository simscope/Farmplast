"use strict";
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  http = require("http"),
  crypto = require("crypto");
const core = require("./core.cjs");
const { memoryAdapter, mockSdk, supabaseAdapter } = require("./adapters.cjs");
function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}
function healthServer(
  worker,
  { port = 0, token = "", wake = () => worker.wake(), offline = false } = {},
) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const reply = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (url.pathname === "/health") {
      reply(200, {
        ok: !worker.store.halted(),
        service: "zkt-bridge-candidate-v2",
        offline,
        busy: !!worker.active,
        halted: worker.store.halted(),
      });
      return;
    }
    if (url.pathname !== "/wake") {
      reply(404, { ok: false });
      return;
    }
    const provided = String(
      req.headers["x-zkt-wake-token"] || url.searchParams.get("token") || "",
    );
    const a = Buffer.from(provided),
      b = Buffer.from(token);
    if (!b.length || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      reply(403, { ok: false, error: "Invalid wake token" });
      return;
    }
    wake();
    reply(202, { ok: true, message: "Wake accepted" });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
async function selfTest() {
  // Load packaged dependencies without constructing a client or opening any network connection.
  require("cross-fetch/polyfill");
  require("dotenv");
  require("ws");
  require("@supabase/supabase-js");
  const state = fs.mkdtempSync(
    path.join(os.tmpdir(), "farmplast-v2-self-test-"),
  );
  const db = memoryAdapter();
  const cfg = { ...core.config({ ZKT_IP: "127.0.0.1" }), autoHours: [] };
  const worker = new core.Worker({
    db,
    sdk: mockSdk,
    cfg,
    store: core.stateStore(state),
  });
  try {
    for (const [i, name] of [
      "test",
      "sync_one_employee",
      "pull_attendance",
      "unknown",
    ].entries())
      db.rows.push({
        id: String(i),
        command: name,
        payload: { employee_id: "offline-fixture" },
        status: "pending",
      });
    await worker.wake();
    if (db.rows.some((r, i) => r.status !== (i === 3 ? "error" : "done")))
      throw Error("Offline dispatch failed");
    console.log(
      JSON.stringify({
        ok: true,
        offline: true,
        commands: 3,
        unknownRejected: true,
        node: process.version,
        arch: process.arch,
      }),
    );
  } finally {
    await worker.close();
    fs.rmSync(state, { recursive: true, force: true });
  }
}
async function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const offline = process.argv.includes("--serve-offline"),
    live = process.argv.includes("--live");
  if (!offline && !live)
    throw core.fail(
      "Candidate v2 is not deployed. Use --self-test or --serve-offline; live mode requires explicit approval/configuration.",
      "CONFIG",
    );
  let env = {},
    client,
    db,
    sdk;
  const log = core.logger();
  if (live) {
    if (offline || process.env.ZKT_V2_ALLOW_LIVE !== "true" || !arg("--config"))
      throw core.fail(
        "Live mode requires --config and ZKT_V2_ALLOW_LIVE=true",
        "CONFIG",
      );
    const file = path.resolve(arg("--config"));
    env = { ...require("dotenv").parse(fs.readFileSync(file)), ...process.env };
    if (
      !env.SUPABASE_URL ||
      !(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY)
    )
      throw core.fail("Missing Supabase configuration", "CONFIG");
    if (new URL(env.SUPABASE_URL).protocol !== "https:")
      throw core.fail("Supabase URL must use HTTPS", "CONFIG");
    require("cross-fetch/polyfill");
    const WS = require("ws");
    const { createClient } = require("@supabase/supabase-js");
    client = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { transport: WS },
      },
    );
    db = supabaseAdapter(client);
    sdk = core.powershell;
  } else {
    env = {
      ZKT_IP: "127.0.0.1",
      ZKT_AUTO_PULL_HOURS: "",
      ZKT_BRIDGE_ACTIVE_START_HOUR: "0",
      ZKT_BRIDGE_ACTIVE_END_HOUR: "24",
    };
    db = memoryAdapter();
    sdk = mockSdk;
  }
  const cfg = core.config(env);
  if (cfg.endHour <= cfg.startHour)
    throw core.fail("Invalid work-hour window", "CONFIG");
  const stateDir = path.resolve(
    arg("--state-dir") || path.join(os.homedir(), ".farmplast-zkt-v2"),
  );
  const worker = new core.Worker({
    db,
    sdk,
    cfg,
    store: core.stateStore(stateDir),
    log,
    redact: core.redactor([
      env.SUPABASE_SERVICE_ROLE_KEY,
      env.SUPABASE_KEY,
      env.ZKT_WAKE_TOKEN,
    ]),
  });
  const release = await core.singleton();
  let closing = false,
    server,
    channel,
    timer;
  const withinHours = () => {
    const h = new Date().getHours();
    return h >= cfg.startHour && h < cfg.endHour;
  };
  const wake = () => {
    if (withinHours() && !closing)
      worker
        .wake()
        .catch((e) =>
          log("worker_error", { code: e.code || "DATABASE_OR_STATE" }),
        );
  };
  async function close() {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    try {
      if (channel) await client.removeChannel(channel);
    } finally {
      try {
        await worker.close();
      } finally {
        if (server) await new Promise((r) => server.close(r));
        await release();
        process.stdin.pause();
      }
    }
    log("shutdown_complete");
  }
  try {
    if (offline || env.ZKT_WAKE_SERVER_ENABLED === "true") {
      if (!offline && !env.ZKT_WAKE_TOKEN)
        throw core.fail("HTTP wake requires ZKT_WAKE_TOKEN", "CONFIG");
      const port = Number(
        arg("--port") ?? env.ZKT_WAKE_SERVER_PORT ?? (offline ? 0 : 8787),
      );
      if (!Number.isInteger(port) || port < 0 || port > 65535)
        throw core.fail("Invalid HTTP port", "CONFIG");
      server = await healthServer(worker, {
        port,
        token: env.ZKT_WAKE_TOKEN || "",
        wake,
        offline,
      });
      log("http_ready", { port: server.address().port });
    }
    if (client && env.ZKT_REALTIME_WAKE_ENABLED !== "false")
      channel = client
        .channel("zkt-bridge-command-wake")
        .on("broadcast", { event: "wake" }, wake)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "zkt_bridge_commands" },
          wake,
        )
        .subscribe();
    timer = setInterval(wake, cfg.pollMs);
    wake();
    process.once("SIGINT", () => close().catch(() => (process.exitCode = 1)));
    process.once("SIGTERM", () => close().catch(() => (process.exitCode = 1)));
    process.stdin.on("data", (b) => {
      if (offline && b.toString().trim() === "shutdown")
        close().catch(() => (process.exitCode = 1));
    });
    if (offline) process.stdin.resume();
  } catch (e) {
    await close();
    throw e;
  }
}
if (require.main === module)
  main().catch((e) => {
    console.error(
      JSON.stringify({ event: "startup_error", code: e.code || "STARTUP" }),
    );
    process.exitCode = 1;
  });
module.exports = { main, selfTest, healthServer };
