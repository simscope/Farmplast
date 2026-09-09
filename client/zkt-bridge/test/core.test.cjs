"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("fs"),
  os = require("os"),
  path = require("path"),
  { spawn } = require("child_process");
const { EventEmitter } = require("events"),
  { PassThrough } = require("stream");
const c = require("../src/core.cjs"),
  { memoryAdapter, mockSdk } = require("../src/adapters.cjs");
const cfg = () => ({
  ...c.config({ ZKT_IP: "127.0.0.1" }),
  autoHours: [],
  commandMs: 2000,
  childMs: 1000,
});
function fixture(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zkt-unit-"));
  const db = memoryAdapter();
  const worker = new c.Worker({
    db,
    sdk: mockSdk,
    cfg: cfg(),
    store: c.stateStore(dir),
    ...extra,
  });
  return {
    dir,
    db,
    worker,
    cleanup: async () => {
      await worker.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("dispatcher and serialized pending/running/done/error states", async () => {
  const f = fixture();
  try {
    for (const [i, command] of [
      "test",
      "sync_one_employee",
      "pull_attendance",
      "unrecognized",
    ].entries())
      f.db.rows.push({
        id: String(i),
        command,
        payload: { employee_id: "fixture-only" },
        status: "pending",
      });
    await Promise.all([f.worker.wake(), f.worker.wake()]);
    assert.deepEqual(
      f.db.rows.map((r) => r.status),
      ["done", "done", "done", "error"],
    );
    assert.deepEqual(f.db.transitions, [
      "running",
      "done",
      "running",
      "done",
      "running",
      "done",
      "running",
      "error",
    ]);
    assert.equal(f.db.updates, 1);
    assert.equal(f.db.rows[3].result.ok, false);
  } finally {
    await f.cleanup();
  }
});
test("reject missing payload, inactive employee, PA payload and malformed fields", () => {
  assert.throws(
    () => c.validate({ command: "sync_one_employee" }),
    /employee_id/,
  );
  assert.throws(
    () => c.validate({ command: "test", payload: { plant_location: "PA" } }),
    /non-NJ/,
  );
  assert.throws(() => c.employeePayload({ active: false }), /inactive/);
  assert.throws(
    () =>
      c.employeePayload({
        active: true,
        zkt_user_id: "x",
        zkt_name: "Fixture",
      }),
    /valid/,
  );
  assert.throws(() => c.config({ ZKT_IP: "localhost" }), /IPv4/);
  const mapped = c.employeePayload({
    active: true,
    employee_number: 23,
    first_name: "Offline",
    last_name: "Fixture",
    zkt_privilege: 14,
  });
  assert.equal(mapped.userId, "23");
  assert.equal(mapped.privilege, 3);
});
test("atomic claim loser performs no SDK work and ignores PA queue", async () => {
  let calls = 0;
  const f = fixture({
    sdk: async () => {
      calls++;
      return { ok: true };
    },
  });
  try {
    f.db.rows.push(
      { id: "pa", command: "test", status: "pending_pa" },
      { id: "nj", command: "test", status: "pending" },
    );
    f.db.claim = async () => {
      f.db.rows[1].status = "running";
      return false;
    };
    await f.worker.wake();
    assert.equal(calls, 0);
    assert.equal(f.db.rows[0].status, "pending_pa");
  } finally {
    await f.cleanup();
  }
});
test("failed terminal DB write is journaled and retried without SDK replay", async () => {
  let calls = 0;
  const f = fixture({
    sdk: async () => {
      calls++;
      return { ok: true };
    },
  });
  try {
    f.db.rows.push({ id: "x", command: "test", status: "pending" });
    const original = f.db.finish;
    f.db.finish = async () => {
      throw Error("Offline DB outage");
    };
    await assert.rejects(f.worker.wake());
    assert.equal(f.db.rows[0].status, "running");
    assert.equal(f.worker.store.read().terminal.status, "done");
    f.db.finish = original;
    await f.worker.wake();
    assert.equal(calls, 1);
    assert.equal(f.db.rows[0].status, "done");
  } finally {
    await f.cleanup();
  }
});
test("uncertain previous worker becomes error, fences SDK and never replays", async () => {
  const f = fixture();
  try {
    f.db.rows.push({
      id: "x",
      command: "test",
      status: "running",
      picked_at: "owned",
    });
    f.worker.store.write({ id: "x", command: "test", pickedAt: "owned" });
    await f.worker.wake();
    assert.equal(f.db.rows[0].status, "error");
    assert.equal(f.worker.store.halted(), true);
  } finally {
    await f.cleanup();
  }
});
test("PowerShell uses exact 32-bit path, stdin input, removes temp files", async () => {
  let seen;
  const spawnFn = (exe, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    seen = { exe, args, opts };
    child.stdin.on("finish", () => {
      child.stdout.write('{"ok":true}');
      child.emit("close", 0);
    });
    return child;
  };
  const r = await c.powershell({ operation: "test" }, { spawnFn });
  assert.equal(r.ok, true);
  assert.equal(seen.exe, c.PS32);
  assert.equal(seen.opts.windowsHide, true);
  assert.equal(seen.args.includes("-NonInteractive"), true);
  assert.equal(fs.existsSync(seen.args.at(-1)), false);
});
test("real offline child timeout kills process, waits close and cleans temp directory", async () => {
  let pid, file;
  const wrap = (exe, args, opts) => {
    file = args.at(-1);
    const child = spawn(exe, args, opts);
    pid = child.pid;
    return child;
  };
  await assert.rejects(
    c.powershell(
      {},
      {
        executable:
          process.env.WINDIR +
          "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        scriptText: "Start-Sleep -Seconds 30",
        timeoutMs: 1500,
        spawnFn: wrap,
      },
    ),
    (e) => e.code === "SDK_TIMEOUT",
  );
  assert.equal(fs.existsSync(file), false);
  assert.throws(() => process.kill(pid, 0));
});
test("command timeout writes error, fences SDK and preserves next pending row", async () => {
  const f = fixture({
    cfg: { ...cfg(), commandMs: 20 },
    sdk: (_r, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(c.fail("Offline timeout", "SDK_TIMEOUT")),
          { once: true },
        ),
      ),
  });
  try {
    f.db.rows.push(
      { id: "one", command: "test", status: "pending" },
      { id: "two", command: "test", status: "pending" },
    );
    await f.worker.wake();
    assert.equal(f.db.rows[0].status, "error");
    assert.equal(f.db.rows[1].status, "pending");
    assert.equal(f.worker.store.halted(), true);
  } finally {
    await f.cleanup();
  }
});
test("attendance dedupe contract and safe failed-batch fallback", async () => {
  const db = memoryAdapter();
  let calls = 0;
  const now = Date.now();
  db.attendance = async (rows) => {
    calls++;
    if (rows.length > 1) throw Error("Offline batch failure");
    db.saved.push(...rows);
  };
  const stamp = new Date(now);
  const s = `${stamp.getFullYear()}-${stamp.getMonth() + 1}-${stamp.getDate()} ${stamp.getHours()}:${stamp.getMinutes()}:${stamp.getSeconds()}`;
  const sdk = async () => ({
    ok: true,
    logs: [
      { userId: "90001", timestamp: s },
      { userId: "90002", timestamp: s },
      { userId: "x", timestamp: "bad" },
    ],
  });
  const r = await c.dispatch(
    { id: "offline", command: "pull_attendance" },
    { db, sdk, cfg: cfg() },
  );
  assert.equal(r.inserted, 2);
  assert.equal(r.skipped, 1);
  assert.equal(calls, 3);
  assert.equal(db.saved[0].employee_number, 90001);
  assert.equal(c.parseTime("2026-02-31 10:00:00"), null);
});
test("safe serialization and structured logs do not serialize arbitrary secret fields", () => {
  assert.deepEqual(c.safe({ id: 1n }), { id: "1" });
  const lines = [];
  c.logger((x) => lines.push(x))("test", {
    command_id: "offline",
    password: "DO-NOT-LOG",
    result: { password: "DO-NOT-LOG" },
  });
  assert.equal(lines.join("").includes("DO-NOT-LOG"), false);
  assert.equal(
    c.redactor(["fixture-private"])("failed fixture-private"),
    "failed [REDACTED]",
  );
});
test("same-machine singleton rejects a duplicate and releases cleanly", async () => {
  const name = "zkt-offline-test-" + process.pid;
  const release = await c.singleton(name);
  try {
    await assert.rejects(c.singleton(name));
  } finally {
    await release();
  }
  const second = await c.singleton(name);
  await second();
});
test("real 32-bit PowerShell mock returns JSON without initializing COM", async () => {
  const result = await c.powershell(
    { message: "offline-fixture" },
    {
      timeoutMs: 10000,
      scriptText:
        "$request=[Console]::In.ReadToEnd() | ConvertFrom-Json; @{ok=$true;is64=[Environment]::Is64BitProcess;message=$request.message}|ConvertTo-Json -Compress",
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.is64, false);
  assert.equal(result.message, "offline-fixture");
});
test("wake during SDK operation is coalesced and drains newly inserted commands once", async () => {
  let release,
    calls = 0;
  const started = new Promise((resolve) => (release = resolve));
  let unblock;
  const gate = new Promise((resolve) => (unblock = resolve));
  const f = fixture({
    sdk: async () => {
      calls++;
      if (calls === 1) {
        release();
        await gate;
      }
      return { ok: true };
    },
  });
  try {
    f.db.rows.push({ id: "first", command: "test", status: "pending" });
    const drain = f.worker.wake();
    await started;
    f.db.rows.push({ id: "next", command: "test", status: "pending" });
    const wake = f.worker.wake();
    unblock();
    await Promise.all([drain, wake]);
    assert.equal(calls, 2);
    assert.deepEqual(
      f.db.rows.map((r) => r.status),
      ["done", "done"],
    );
  } finally {
    await f.cleanup();
  }
});
test("scheduled attendance runs once per local day/hour, with no queue row mutation", async () => {
  let calls = 0;
  const f = fixture({
    cfg: { ...cfg(), autoHours: [0] },
    sdk: async () => {
      calls++;
      return { ok: true, logs: [] };
    },
  });
  try {
    await f.worker.wake();
    await f.worker.wake();
    assert.equal(calls, 1);
    assert.equal(f.worker.store.autoDone().length, 1);
    assert.equal(f.db.transitions.length, 0);
  } finally {
    await f.cleanup();
  }
});
test("SDK failure preserves error result without marking employee synced or logging secret", async () => {
  const db = memoryAdapter();
  db.employee = async () => ({
    id: "fixture",
    employee_number: 12,
    active: true,
    first_name: "Offline",
    zkt_password: "fixture-password-only",
  });
  const f = fixture({
    db,
    sdk: async () => ({ ok: false, error: "rejected fixture-password-only" }),
  });
  try {
    db.rows.push({
      id: "f",
      command: "sync_one_employee",
      payload: { employee_id: "fixture" },
      status: "pending",
    });
    await f.worker.wake();
    assert.equal(db.rows[0].status, "error");
    assert.equal(db.updates, 0);
    assert.equal(
      JSON.stringify(db.rows[0].result).includes("fixture-password-only"),
      false,
    );
  } finally {
    await f.cleanup();
  }
});
test("Supabase adapter builds conditional claims, scoped finishes and deduplicating upserts", async () => {
  const { supabaseAdapter } = require("../src/adapters.cjs");
  const actions = [];
  const query = new Proxy(
    {},
    {
      get: (_t, key) =>
        key === "then"
          ? (resolve) => resolve({ data: [{ id: "claimed" }], error: null })
          : (...args) => {
              actions.push([key, ...args]);
              return query;
            },
    },
  );
  const db = supabaseAdapter({
    from: (table) => {
      actions.push(["from", table]);
      return query;
    },
    rpc: () => query,
  });
  const signal = new AbortController().signal;
  assert.equal(await db.claim("id", "time", signal), true);
  assert(
    actions.some(
      (x) => x[0] === "eq" && x[1] === "status" && x[2] === "pending",
    ),
  );
  actions.length = 0;
  await db.finish("id", "time", { status: "done" }, signal);
  assert(
    actions.some(
      (x) => x[0] === "eq" && x[1] === "picked_at" && x[2] === "time",
    ),
  );
  actions.length = 0;
  await db.attendance([], signal);
  assert(
    actions.some(
      (x) =>
        x[0] === "upsert" &&
        x[2].ignoreDuplicates === true &&
        x[2].onConflict === "employee_number,punch_time",
    ),
  );
  assert(actions.some((x) => x[0] === "abortSignal" && x[1] === signal));
});
