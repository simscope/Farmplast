"use strict";
const fs = require("fs"),
  path = require("path"),
  os = require("os"),
  crypto = require("crypto"),
  { spawnSync } = require("child_process");
async function main() {
  const root = path.resolve(__dirname, "..");
  process.chdir(root);
  const pkg = require("pkg/package.json");
  if (pkg.version !== "5.8.1")
    throw Error("Unexpected pkg version; run npm ci");
  const fetchPath = require.resolve("pkg-fetch", {
    paths: [path.dirname(require.resolve("pkg/package.json"))],
  });
  const binary = await require(fetchPath).need({
    nodeRange: "node18",
    platform: "win",
    arch: "x64",
  });
  const sha = crypto
    .createHash("sha256")
    .update(fs.readFileSync(binary))
    .digest("hex");
  const expected =
    "e0e9a647d81011612f8cb19c6a41760643eedd27222af548e9ffdff7d8ebb94b";
  if (sha !== expected)
    throw Error(
      "Base runtime differs from verified cached pkg Node18.5.0 runtime; refusing build",
    );
  fs.mkdirSync("build", { recursive: true });
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("pkg/lib-es5/bin.js"),
      ".",
      "--targets",
      "node18-win-x64",
      "--no-bytecode",
      "--public-packages",
      "*",
      "--public",
      "--output",
      "build/zkt-bridge-v2.exe",
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) throw Error("pkg build failed");
  const out = path.join(root, "build", "zkt-bridge-v2.exe");
  const hash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(out))
    .digest("hex");
  fs.writeFileSync(
    path.join(root, "build", "BUILD-MANIFEST.json"),
    JSON.stringify(
      {
        candidate: true,
        productionEquivalent: false,
        hostNode: process.version,
        hostPlatform: os.platform(),
        packager: pkg.version,
        baseRuntime: binary,
        baseSha256: sha,
        output: out,
        sha256: hash,
      },
      null,
      2,
    ),
  );
  console.log("CANDIDATE_V2_SHA256=" + hash);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
