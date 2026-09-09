"use strict";
const { spawn, spawnSync } = require("child_process"),
  fs = require("fs"),
  os = require("os"),
  path = require("path"),
  http = require("http"),
  assert = require("assert/strict");
const exe = path.resolve(__dirname, "../build/zkt-bridge-v2.exe");
async function main() {
  const smoke = spawnSync(exe, ["--self-test"], {
    encoding: "utf8",
    timeout: 30000,
  });
  assert.equal(smoke.status, 0, smoke.stderr);
  const line = smoke.stdout.trim().split(/\r?\n/).at(-1);
  const result = JSON.parse(line);
  assert.equal(result.ok, true);
  assert.equal(result.node, "v18.5.0");
  assert.equal(result.arch, "x64");
  console.log("PASS packaged mock dispatcher on Node18.5.0 x64");
  const invalid = spawnSync(exe, [], { encoding: "utf8", timeout: 10000 });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /CONFIG/);
  console.log("PASS default launch refuses live adapters");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zkt-exe-offline-"));
  const child = spawn(exe, ["--serve-offline", "--state-dir", dir], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "",
    errors = "";
  child.stderr.on("data", (b) => (errors += b));
  const exit = new Promise((resolve) => child.on("close", resolve));
  const timeout = setTimeout(() => child.kill("SIGKILL"), 15000);
  try {
    const port = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.stdout.on("data", (b) => {
        output += b.toString();
        for (const line of output.split(/\r?\n/)) {
          try {
            const item = JSON.parse(line);
            if (item.event === "http_ready") resolve(item.port);
          } catch {}
        }
      });
      child.once("close", () =>
        reject(Error("Offline server closed before readiness: " + errors)),
      );
    });
    const health = await new Promise((resolve, reject) => {
      http
        .get({ hostname: "127.0.0.1", port, path: "/health" }, (r) => {
          let body = "";
          r.on("data", (b) => (body += b));
          r.on("end", () => resolve(JSON.parse(body)));
        })
        .on("error", reject);
    });
    assert.equal(health.offline, true);
    assert.equal(health.ok, true);
    const duplicate = spawnSync(
      exe,
      ["--serve-offline", "--state-dir", path.join(dir, "duplicate")],
      { encoding: "utf8", timeout: 5000 },
    );
    assert.notEqual(duplicate.status, 0);
    console.log("PASS duplicate worker refused");
    child.stdin.write("shutdown\n");
    child.stdin.end();
    assert.equal(await exit, 0, errors);
    assert.match(output, /shutdown_complete/);
    console.log("PASS loopback health and clean shutdown");
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null) child.kill("SIGKILL");
    await exit;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
