// Packages the bundled desktop server (dist/desktop/index.cjs) into a single
// executable for the HOST platform+arch with @yao-pkg/pkg, named for Tauri's
// sidecar convention: src-tauri/binaries/<BIN_NAME>-<rust-target-triple>[.exe].
//
// One binary per (os, arch) — macOS is built per-arch, never `lipo`'d into a
// universal one (pkg's appended payload does not survive `lipo -create`).
//
//   node scripts/package-server.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec as pkgExec } from "@yao-pkg/pkg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = path.join(ROOT, "dist/desktop/index.cjs");
const OUT_DIR = path.join(ROOT, "src-tauri/binaries");
const BIN_NAME = "fast-cut-video-server";
const NODE_RANGE = "node22";
const arm = process.arch === "arm64";

// host os -> { pkg target, Rust target triple Tauri resolves the sidecar by }.
const HOST = {
  win32: { pkg: `${NODE_RANGE}-win-x64`, triple: "x86_64-pc-windows-msvc", exe: ".exe" },
  linux: {
    pkg: `${NODE_RANGE}-linux-${arm ? "arm64" : "x64"}`,
    triple: `${arm ? "aarch64" : "x86_64"}-unknown-linux-gnu`,
    exe: "",
  },
  darwin: {
    pkg: `${NODE_RANGE}-macos-${arm ? "arm64" : "x64"}`,
    triple: `${arm ? "aarch64" : "x86_64"}-apple-darwin`,
    exe: "",
  },
};

const target = HOST[process.platform];
if (!target) {
  console.error(`plataforma não suportada: ${process.platform}`);
  process.exit(1);
}
const targets = [target];
if (!fs.existsSync(ENTRY)) {
  console.error(`falta ${path.relative(ROOT, ENTRY)} — rode 'npm run build:desktop-server' antes`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const { pkg, triple, exe } of targets) {
  const out = path.join(OUT_DIR, `${BIN_NAME}-${triple}${exe}`);
  console.log(`\n▶ ${pkg} → ${path.relative(ROOT, out)}`);
  await pkgExec([ENTRY, "--target", pkg, "--output", out, "--compress", "GZip"]);
  if (!fs.existsSync(out)) {
    console.error(`pkg não gerou ${out}`);
    process.exit(1);
  }
  fs.chmodSync(out, 0o755);
  const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`  ${mb} MB`);
}

console.log("\nPronto.");
