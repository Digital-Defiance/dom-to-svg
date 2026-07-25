#!/usr/bin/env node
/**
 * Build a store-ready zip: yarn pack:store → dom-to-svg-<version>.zip
 *
 * Ships ONLY the runtime extension files (allowlist). Does not include
 * assets/, tests, node_modules, source converter modules, etc.
 *
 * Note: dist/inject.js IS required — the service worker injects it.
 * Do not confuse with `npm pack` / `yarn pack`, which build npm .tgz files.
 */
import { execSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdtempSync,
} from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const version = manifest.version || "0.0.0";
const stage = mkdtempSync(join(tmpdir(), "dom-to-svg-"));
const zipName = `dom-to-svg-${version}.zip`;
const zipPath = join(root, zipName);

/** Exact relative paths allowed in the store package (no extras). */
const ALLOWLIST = new Set([
  "manifest.json",
  "src/background.js",
  "dist/inject.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
]);

console.log("Building inject bundle…");
execSync("npm run build", { cwd: root, stdio: "inherit" });

if (!existsSync(join(root, "dist/inject.js"))) {
  console.error("Missing dist/inject.js after build");
  process.exit(1);
}

rmSync(stage, { recursive: true, force: true });

for (const rel of ALLOWLIST) {
  const dest = join(stage, rel);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(root, rel), dest);
}

const staged = listFiles(stage);
const unexpected = staged.filter((f) => !ALLOWLIST.has(f));
const missing = [...ALLOWLIST].filter((f) => !staged.includes(f));
if (unexpected.length || missing.length) {
  console.error("Stage allowlist mismatch.");
  if (missing.length) console.error("  missing:", missing.join(", "));
  if (unexpected.length) console.error("  unexpected:", unexpected.join(", "));
  process.exit(1);
}

rmSync(zipPath, { force: true });

try {
  execSync(`zip -r -q ${JSON.stringify(zipPath)} .`, {
    cwd: stage,
    stdio: "inherit",
  });
} catch {
  await writeZipFallback(stage, zipPath);
}

// Verify zip contents match allowlist (ignore directory entries)
const listed = execSync(`unzip -Z1 ${JSON.stringify(zipPath)}`, { encoding: "utf8" })
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s && !s.endsWith("/"));
const zipExtra = listed.filter((f) => !ALLOWLIST.has(f));
const zipMissing = [...ALLOWLIST].filter((f) => !listed.includes(f));
if (zipExtra.length || zipMissing.length) {
  console.error("Zip allowlist mismatch.");
  if (zipMissing.length) console.error("  missing:", zipMissing.join(", "));
  if (zipExtra.length) console.error("  unexpected:", zipExtra.join(", "));
  process.exit(1);
}

const size = readFileSync(zipPath).byteLength;
console.log(`Packed ${zipName} (${(size / 1024).toFixed(1)} KB)`);
console.log("Contents:");
for (const f of [...ALLOWLIST].sort()) console.log(`  ${f}`);
console.log("Upload this zip to Chrome Web Store / Edge Add-ons.");
console.log("(Use `yarn pack:store` / `npm run pack:store`; bare `pack` creates an npm .tgz.)");
rmSync(stage, { recursive: true, force: true });

function listFiles(dir, base = dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === ".DS_Store" || name === "Thumbs.db") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) listFiles(abs, base, out);
    else out.push(relative(base, abs).split("\\").join("/"));
  }
  return out;
}

async function writeZipFallback(dir, outFile) {
  const files = listFiles(dir);
  const parts = [];
  const central = [];
  let offset = 0;

  for (const name of files) {
    const data = readFileSync(join(dir, name));
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const cen = Buffer.alloc(46 + nameBuf.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc32(data), 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    nameBuf.copy(cen, 46);

    parts.push(local, data);
    central.push(cen);
    offset += local.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  writeFileSync(outFile, Buffer.concat([...parts, centralBuf, end]));
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
