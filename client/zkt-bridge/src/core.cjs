"use strict";
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  net = require("net");
const { spawn } = require("child_process");
const PS32 = "C:\\Windows\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe";
const MODE = "official_zkteco_sdk_com_32bit_powershell";
const fail = (message, code = "COMMAND_ERROR") =>
  Object.assign(new Error(message), { code });
function check(signal) {
  if (signal?.aborted)
    throw fail("Command deadline or shutdown requested", "ABORTED");
}
function safe(value) {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? String(v) : v)),
  );
}
function redactor(secrets = []) {
  return (value) => {
    let s = String(value || "Unknown bridge error");
    for (const secret of secrets.filter(Boolean))
      s = s.split(String(secret)).join("[REDACTED]");
    return s.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[REDACTED]");
  };
}
function logger(write = console.log) {
  return (event, fields = {}) => {
    const row = { at: new Date().toISOString(), event };
    for (const key of [
      "command_id",
      "command",
      "employee_id",
      "elapsed_ms",
      "code",
      "trigger",
      "pid",
      "port",
    ])
      if (fields[key] !== undefined) row[key] = fields[key];
    write(JSON.stringify(row));
  };
}
function config(env) {
  const number = (key, fallback, min = 1, max = 3600000) => {
    const n = Number(env[key] ?? fallback);
    if (!Number.isInteger(n) || n < min || n > max)
      throw fail(`Invalid ${key}`, "CONFIG");
    return n;
  };
  const ip = env.ZKT_IP;
  if (!ip || net.isIP(ip) !== 4)
    throw fail("ZKT_IP must be an explicit IPv4 address", "CONFIG");
  return {
    ip,
    port: number("ZKT_PORT", 4370, 1, 65535),
    machine: number("ZKT_MACHINE_NUMBER", 1),
    pollMs: number("POLL_INTERVAL_MS", 300000),
    commandMs: number("ZKT_COMMAND_TIMEOUT", 300000),
    childMs: number("ZKT_POWERSHELL_TIMEOUT", 300000),
    batch: number("ZKT_ATTENDANCE_UPSERT_BATCH_SIZE", 50, 1, 500),
    lookback: number("ZKT_ATTENDANCE_LOOKBACK_DAYS", 3, 1, 365),
    startHour: number("ZKT_BRIDGE_ACTIVE_START_HOUR", 8, 0, 23),
    endHour: number("ZKT_BRIDGE_ACTIVE_END_HOUR", 21, 1, 24),
    autoHours: String(env.ZKT_AUTO_PULL_HOURS ?? "8,20")
      .split(",")
      .filter(Boolean)
      .map((v) => {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 23)
          throw fail("Invalid auto-pull hour", "CONFIG");
        return n;
      }),
  };
}
function employeePayload(emp) {
  if (!emp) throw fail("Employee not found");
  if (!emp.active) throw fail("Employee is inactive");
  if (emp.zkt_enabled === false) throw fail("Employee ZKT sync is disabled");
  const id =
    String(emp.zkt_user_id ?? "").trim() ||
    String(emp.employee_number ?? "").trim();
  if (!id || !/^[0-9]+$/.test(id))
    throw fail("Employee has no valid zkt_user_id or employee_number");
  const name = String(
    emp.zkt_name || `${emp.first_name || ""} ${emp.last_name || ""}`,
  )
    .trim()
    .slice(0, 24);
  if (!name) throw fail("Employee has no valid ZKT name");
  const n = Number(emp.zkt_privilege || 0);
  if (!Number.isFinite(n) || !Number.isInteger(n))
    throw fail("Invalid ZKT privilege");
  return {
    userId: id,
    name,
    password: String(emp.zkt_password ?? ""),
    privilege: Math.min(3, Math.max(0, n)),
    cardNo: String(emp.zkt_card_number ?? "").trim(),
    enabled: true,
  };
}
function validate(command) {
  if (
    !["test", "sync_one_employee", "pull_attendance"].includes(command.command)
  )
    throw fail(
      `Unknown command: ${String(command.command)}`,
      "UNKNOWN_COMMAND",
    );
  const p = command.payload || {};
  if (typeof p !== "object" || Array.isArray(p))
    throw fail("payload must be an object", "PAYLOAD");
  if (p.plant_location && p.plant_location !== "NJ")
    throw fail("Candidate NJ bridge refuses non-NJ payload", "PLANT");
  if (command.command === "sync_one_employee" && !(p.employee_id || p.id))
    throw fail("sync_one_employee requires payload.employee_id", "PAYLOAD");
  return p;
}
function parseTime(value) {
  const m = String(value || "").match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/,
  );
  if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1).map((x) => Number(x || 0));
  const date = new Date(y, mo - 1, d, h, mi, se);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d ||
    date.getHours() !== h ||
    date.getMinutes() !== mi ||
    date.getSeconds() !== se
  )
    return null;
  return date.toISOString();
}
async function powershell(
  request,
  {
    signal,
    timeoutMs = 300000,
    executable = PS32,
    scriptText,
    spawnFn = spawn,
  } = {},
) {
  check(signal);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "farmplast-v2-sdk-"));
  const file = path.join(dir, "operation.ps1");
  fs.writeFileSync(
    file,
    scriptText ?? fs.readFileSync(path.join(__dirname, "zkt.ps1"), "utf8"),
  );
  try {
    return await new Promise((resolve, reject) => {
      let child,
        output = "",
        size = 0,
        reason = null,
        killGrace = null,
        settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(killGrace);
        signal?.removeEventListener("abort", abort);
        error ? reject(error) : resolve(result);
      };
      const stop = (error) => {
        if (reason) return;
        reason = error;
        if (child) {
          child.kill("SIGKILL");
          killGrace = setTimeout(
            () =>
              finish(
                fail(
                  "Child termination could not be confirmed",
                  "CHILD_NOT_TERMINATED",
                ),
              ),
            5000,
          );
        }
      };
      const abort = () =>
        stop(
          fail(
            "PowerShell operation interrupted; device state may be uncertain",
            "SDK_TIMEOUT",
          ),
        );
      const timer = setTimeout(
        () =>
          stop(
            fail(
              "PowerShell deadline exceeded; device state may be uncertain",
              "SDK_TIMEOUT",
            ),
          ),
        timeoutMs,
      );
      try {
        child = spawnFn(
          executable,
          [
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            file,
          ],
          { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
        );
      } catch {
        finish(fail("PowerShell could not start", "SDK_START"));
        return;
      }
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      child.on("error", () =>
        finish(fail("PowerShell could not start", "SDK_START")),
      );
      child.stdout.on("data", (chunk) => {
        size += chunk.length;
        if (size > 20 * 1024 * 1024) {
          stop(fail("SDK output exceeded size limit", "SDK_OUTPUT_LIMIT"));
          return;
        }
        output += chunk.toString("utf8");
      });
      child.stderr.resume(); // Never include stderr/script lines, which could expose employee fields.
      child.on("close", (code) => {
        if (reason) {
          finish(reason);
          return;
        }
        if (code !== 0) {
          finish(fail("PowerShell exited unsuccessfully", "SDK_EXIT"));
          return;
        }
        try {
          const lines = output.trim().split(/\r?\n/);
          const result = JSON.parse(lines[lines.length - 1]);
          if (!result || typeof result.ok !== "boolean") throw Error();
          finish(null, result);
        } catch {
          finish(fail("PowerShell returned invalid JSON", "SDK_JSON"));
        }
      });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify(request));
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function dispatch(
  command,
  { db, sdk, cfg, signal, log = () => {}, now = () => Date.now() },
) {
  const payload = validate(command);
  check(signal);
  const context = {
    command_id: command.id,
    command: command.command,
    employee_id: payload.employee_id || payload.id,
  };
  const callSdk = async (user) => {
    check(signal);
    log("sdk_start", context);
    const r = await sdk(
      {
        operation: command.command,
        ip: cfg.ip,
        port: cfg.port,
        machine: cfg.machine,
        user,
      },
      { signal, timeoutMs: cfg.childMs },
    );
    check(signal);
    log("sdk_finished", context);
    if (!r.ok)
      throw fail(r.error || r.message || "SDK operation failed", "SDK_FAILURE");
    return r;
  };
  if (command.command === "test") return callSdk();
  if (command.command === "sync_one_employee") {
    const id = payload.employee_id || payload.id;
    const emp = await db.employee(id, signal);
    check(signal);
    const user = employeePayload(emp);
    let result;
    try {
      result = await callSdk(user);
    } catch (e) {
      e.message = redactor([user.password])(e.message);
      throw e;
    }
    await db.employeeStatus(
      id,
      {
        zkt_sync_status: "verified_sdk",
        zkt_sync_error: null,
        zkt_synced_at: new Date(now()).toISOString(),
      },
      signal,
    );
    check(signal);
    return {
      ok: true,
      message: "Single employee synced to ZKT by official SDK",
      mode: MODE,
      employee_id: emp.id,
      employee_number: emp.employee_number,
      zkt_user_id: user.userId,
      name: user.name,
      result,
    };
  }
  const result = await callSdk();
  const logs = Array.isArray(result.logs) ? result.logs : [];
  const rows = logs
    .map((raw) => ({
      employee_number: Number(raw.deviceUserId || raw.userId),
      punch_time: parseTime(raw.timestamp),
      raw: safe(raw),
    }))
    .filter(
      (r) =>
        Number.isSafeInteger(r.employee_number) &&
        r.employee_number > 0 &&
        r.punch_time &&
        Date.parse(r.punch_time) >= now() - cfg.lookback * 86400000,
    );
  let inserted = 0;
  for (let i = 0; i < rows.length; i += cfg.batch) {
    check(signal);
    const batch = rows.slice(i, i + cfg.batch);
    try {
      await db.attendance(batch, signal);
      inserted += batch.length;
    } catch (e) {
      check(signal);
      for (const row of batch) {
        try {
          await db.attendance([row], signal);
          inserted++;
        } catch {
          check(signal);
        }
      }
    }
  }
  let processed;
  try {
    processed = await db.processAttendance(signal);
  } catch {
    check(signal);
    processed = { ok: false, error: "Attendance processing RPC failed" };
  }
  check(signal);
  return {
    ok: true,
    message: "Attendance pull finished by official SDK",
    mode: MODE,
    total: logs.length,
    inserted,
    skipped: logs.length - inserted,
    processed,
  };
}
function stateStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const journal = path.join(dir, "command-journal.json");
  const autoFile = path.join(dir, "auto-pull-state.json");
  const autoDone = () =>
    fs.existsSync(autoFile)
      ? JSON.parse(fs.readFileSync(autoFile, "utf8"))
      : [];
  return {
    autoDone,
    markAuto: (key) =>
      fs.writeFileSync(
        autoFile,
        JSON.stringify([...autoDone().slice(-60), key]),
      ),
    read: () =>
      fs.existsSync(journal)
        ? JSON.parse(fs.readFileSync(journal, "utf8"))
        : null,
    write: (value) => {
      fs.writeFileSync(journal + ".tmp", JSON.stringify(value));
      fs.renameSync(journal + ".tmp", journal);
    },
    clear: () => fs.rmSync(journal, { force: true }),
    halt: () =>
      fs.writeFileSync(
        path.join(dir, "SDK-UNCERTAIN"),
        "SDK timeout/uncertain prior worker. Inspect device/worker before removing this file.",
      ),
    halted: () => fs.existsSync(path.join(dir, "SDK-UNCERTAIN")),
  };
}
class Worker {
  constructor({
    db,
    sdk,
    cfg,
    store,
    log = () => {},
    redact = redactor(),
    shutdown = new AbortController(),
  }) {
    Object.assign(this, { db, sdk, cfg, store, log, redact, shutdown });
    this.active = null;
    this.again = false;
  }
  async finish(entry) {
    if (entry.auto) {
      this.store.markAuto(entry.id);
      this.store.clear();
      return;
    }
    const signal = AbortSignal.timeout(15000);
    const terminal = entry.terminal || {
      status: "error",
      error:
        "Previous worker stopped; operation outcome is uncertain. No automatic replay.",
      result: { ok: false, error: "Uncertain outcome; no automatic replay." },
      finished_at: new Date().toISOString(),
    };
    await this.db.finish(entry.id, entry.pickedAt, terminal, signal);
    this.store.clear();
    this.log("database_result_saved", {
      command_id: entry.id,
      command: entry.command,
    });
  }
  async processOne() {
    const prior = this.store.read();
    if (prior) {
      if (!prior.terminal) this.store.halt();
      await this.finish(prior);
    }
    if (this.shutdown.signal.aborted || this.store.halted()) return false;
    let command = await this.db.pending(AbortSignal.timeout(15000));
    if (!command && this.cfg.autoHours?.length) {
      const d = new Date(),
        day = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      const hour = this.cfg.autoHours
        .filter((h) => h <= d.getHours())
        .find((h) => !this.store.autoDone().includes(`auto:${day}:${h}`));
      if (hour !== undefined)
        command = {
          id: `auto:${day}:${hour}`,
          command: "pull_attendance",
          payload: {},
          auto: true,
        };
    }
    if (!command) return false;
    const start = Date.now(),
      pickedAt = new Date(start).toISOString(),
      entry = {
        id: command.id,
        command: command.command,
        pickedAt,
        auto: command.auto === true,
      };
    this.store.write(entry);
    const claimed =
      command.auto ||
      (await this.db.claim(command.id, pickedAt, AbortSignal.timeout(15000)));
    if (!claimed) {
      this.store.clear();
      return true;
    }
    const ctx = {
      command_id: command.id,
      command: command.command,
      employee_id: command.payload?.employee_id,
    };
    this.log("processing_start", ctx);
    const controller = new AbortController(),
      abort = () => controller.abort();
    this.current = controller;
    this.shutdown.signal.addEventListener("abort", abort, { once: true });
    if (this.shutdown.signal.aborted) abort();
    const timer = setTimeout(abort, this.cfg.commandMs);
    let terminal;
    try {
      const result = await dispatch(command, {
        db: this.db,
        sdk: this.sdk,
        cfg: this.cfg,
        signal: controller.signal,
        log: this.log,
      });
      terminal = { status: "done", result: safe(result), error: null };
    } catch (e) {
      const message = this.redact(e.message);
      terminal = {
        status: "error",
        error: message,
        result: { ok: false, error: message },
      };
      if (
        ["SDK_TIMEOUT", "CHILD_NOT_TERMINATED", "SDK_OUTPUT_LIMIT"].includes(
          e.code,
        )
      )
        this.store.halt();
      this.log("command_failed", { ...ctx, code: e.code || "COMMAND_ERROR" });
    } finally {
      clearTimeout(timer);
      this.shutdown.signal.removeEventListener("abort", abort);
      this.current = null;
    }
    terminal.finished_at = new Date().toISOString();
    entry.terminal = terminal;
    this.store.write(entry);
    await this.finish(entry);
    this.log("command_finished", { ...ctx, elapsed_ms: Date.now() - start });
    return true;
  }
  wake() {
    this.again = true;
    if (this.active) return this.active;
    this.active = (async () => {
      try {
        do {
          this.again = false;
          let count = 0;
          while (!this.shutdown.signal.aborted && (await this.processOne())) {
            if (++count >= 100) {
              this.again = true;
              break;
            }
          }
        } while (
          this.again &&
          !this.shutdown.signal.aborted &&
          !this.store.halted()
        );
      } finally {
        this.active = null;
      }
    })();
    return this.active;
  }
  async close() {
    this.shutdown.abort();
    if (this.active) await this.active.catch(() => {});
  }
}
async function singleton(name = "farmplast-zkt-candidate-v2") {
  const server = net.createServer((socket) => socket.end());
  const endpoint =
    process.platform === "win32"
      ? `\\\\.\\pipe\\${name}`
      : path.join(os.tmpdir(), name + ".sock");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, resolve);
  });
  return () => new Promise((resolve) => server.close(resolve));
}
module.exports = {
  PS32,
  MODE,
  fail,
  check,
  safe,
  redactor,
  logger,
  config,
  employeePayload,
  validate,
  parseTime,
  powershell,
  dispatch,
  stateStore,
  Worker,
  singleton,
};
