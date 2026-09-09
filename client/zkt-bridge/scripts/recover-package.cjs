"use strict";
// Static pkg VFS extraction only: no eval, vm, cachedData loading, or recovered code execution.
const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const [input, output] = process.argv.slice(2);
if (!input || !output)
  throw Error(
    "Usage: node scripts/recover-package.cjs VERIFIED_EXE PRIVATE_OUTPUT_DIRECTORY",
  );
const root = path.resolve(__dirname, ".."),
  dest = path.resolve(output);
if (
  dest === root ||
  dest.toLowerCase().startsWith(root.toLowerCase() + path.sep)
)
  throw Error(
    "Raw extraction must stay outside the canonical recovery/source directory",
  );
if (fs.existsSync(dest))
  throw Error("Use a new private analysis directory; refusing overwrite");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex"),
  b = fs.readFileSync(input);
if (
  sha(b) !== "5a45d0f09506336d4a771c79ee942ddf407b12aad54607b4daf5be39030dff60"
)
  throw Error("Not the verified historical executable");
const a = b.toString("latin1"),
  pos = Number(a.match(/PAYLOAD_POSITION = '(\d+)\s*'/)?.[1]),
  pre = Number(a.match(/PRELUDE_POSITION = '(\d+)\s*'/)?.[1]);
if (!pos || !pre || pre <= pos) throw Error("Invalid pkg offsets");
const t = b.subarray(pre).toString("utf8"),
  start = t.lastIndexOf('{"C:\\\\snapshot\\\\zkt-bridge\\\\bridge.cjs"'),
  end = t.indexOf("\n,", start);
if (start < 0 || end < 0) throw Error("Expected snapshot index not found");
const index = JSON.parse(t.slice(start, end));
fs.mkdirSync(dest, { recursive: true });
fs.writeFileSync(path.join(dest, ".gitignore"), "*\n");
const inventory = [],
  packages = [],
  maps = [];
for (const [virtual, entries] of Object.entries(index)) {
  const rel = virtual
    .replace(/^C:\\snapshot\\zkt-bridge\\/, "")
    .replaceAll("\\", "/");
  if (
    rel.includes(":") ||
    rel.split("/").includes("..") ||
    rel.startsWith("/")
  ) {
    if (entries["0"] || entries["1"]) throw Error("Unsafe file path");
    continue;
  }
  const category = entries["1"]
    ? /\.(json|map)$/.test(rel)
      ? "D metadata"
      : rel.includes("/dist/")
        ? "B generated stored source"
        : "A exact stored source/asset"
    : entries["0"]
      ? "C cached bytecode only"
      : "D metadata";
  const row = { virtual, category, entries: {} };
  for (const [kind, [offset, size]] of Object.entries(entries)) {
    if (
      !Number.isInteger(offset) ||
      !Number.isInteger(size) ||
      offset < 0 ||
      size < 0 ||
      pos + offset + size > pre
    )
      throw Error("Invalid payload range");
    const data = b.subarray(pos + offset, pos + offset + size);
    row.entries[kind] = { size, sha256: sha(data) };
    if (kind === "0" || kind === "1") {
      const file = path.join(
        dest,
        "extracted",
        rel + (kind === "0" ? ".v8cache" : ""),
      );
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, data);
      if (kind === "1" && rel.endsWith("package.json")) {
        const pkg = JSON.parse(data);
        packages.push({ virtual, name: pkg.name, version: pkg.version });
      }
      if (kind === "1" && rel.endsWith(".map")) {
        try {
          const map = JSON.parse(data);
          (map.sourcesContent || []).forEach((source, i) => {
            if (typeof source !== "string") return;
            const name = sha(Buffer.from(virtual + ":" + i)) + ".txt";
            const dir = path.join(dest, "source-map-content");
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, name), source);
            maps.push({
              map: virtual,
              source: map.sources?.[i],
              file: name,
              sha256: sha(Buffer.from(source)),
            });
          });
        } catch {
          /* A map without embedded source cannot reconstruct its original text. */
        }
      }
    }
  }
  inventory.push(row);
}
const main = fs.readFileSync(
  path.join(dest, "extracted", "bridge.cjs.v8cache"),
);
fs.writeFileSync(
  path.join(dest, "MAIN-STRINGS.txt"),
  (main.toString("latin1").match(/[\x20-\x7e\r\n\t]{5,}/g) || []).join(
    "\n---\n",
  ),
);
fs.writeFileSync(
  path.join(dest, "INVENTORY.json"),
  JSON.stringify(
    {
      baselineSha256: sha(b),
      payloadPosition: pos,
      preludePosition: pre,
      inventory,
      packages,
      sourceMaps: maps,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    packager: "pkg-compatible",
    files: inventory.length,
    packages: packages.length,
    sourceMapTexts: maps.length,
    mainReadableSource: false,
  }),
);
