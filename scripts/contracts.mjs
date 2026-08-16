import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const DEFAULT_MANIFEST = path.resolve("contracts/manifest.json");

function fail(message) { throw new Error(message); }

function inside(root, candidate, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    fail(label + " 越出允许目录: " + candidate);
  }
  return resolved;
}

async function loadManifest(manifestPath) {
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
  catch (error) { fail("manifest 无法解析: " + error.message); }
  if (!SHA_PATTERN.test(manifest.commit || "")) fail("manifest 缺少不可变的 40 位提交 SHA");
  if (typeof manifest.repository !== "string" || !/^https:\/\/github\.com\/[^/]+\/[^/]+\.git$/.test(manifest.repository)) {
    fail("manifest 治理仓 URL 无效");
  }
  if (manifest.schemaRoot !== "docs/schemas") fail("manifest schemaRoot 不在允许目录");
  if (!Array.isArray(manifest.schemas) || manifest.schemas.length === 0) fail("manifest 缺少 schemas");
  return manifest;
}

export async function verify(manifestPath = DEFAULT_MANIFEST) {
  const manifest = await loadManifest(manifestPath);
  const contractsRoot = path.dirname(manifestPath);
  const seen = new Set();
  for (const entry of manifest.schemas) {
    if (!entry || typeof entry !== "object") fail("schema 条目无效");
    if (!DIGEST_PATTERN.test(entry.sha256 || "")) fail((entry.name || "unknown") + " 缺少 SHA-256");
    if (!/^\d+$/.test(entry.schemaVersion || "")) fail((entry.name || "unknown") + " 缺少 schema 版本");
    const source = inside(manifest.schemaRoot, path.relative(manifest.schemaRoot, entry.source || ""), "source 路径");
    if (source !== path.resolve(entry.source)) fail("source 路径不在 " + manifest.schemaRoot + ": " + entry.source);
    const localPath = inside(contractsRoot, entry.local || "", "local 路径");
    if (seen.has(localPath)) fail("重复 local 路径: " + entry.local);
    seen.add(localPath);
    let bytes;
    try { bytes = await readFile(localPath); }
    catch (error) { fail(entry.local + " 无法读取: " + error.message); }
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== entry.sha256) fail(entry.local + " SHA-256 不匹配");
    let schema;
    try { schema = JSON.parse(bytes.toString("utf8")); }
    catch (error) { fail(entry.local + " Schema JSON 无法解析: " + error.message); }
    if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") fail(entry.local + " 不是 Draft 2020-12 Schema");
    if (typeof schema.$id !== "string" || schema.$id.indexOf("/v" + entry.schemaVersion + "/") < 0) {
      fail(entry.local + " 的 $id 与 schemaVersion 不一致");
    }
  }
  return manifest;
}

export async function sync(manifestPath = DEFAULT_MANIFEST) {
  const manifest = await loadManifest(manifestPath);
  const contractsRoot = path.dirname(manifestPath);
  const repositoryPath = new URL(manifest.repository).pathname.replace(/^\//, "").replace(/\.git$/, "");
  for (const entry of manifest.schemas) {
    inside(manifest.schemaRoot, path.relative(manifest.schemaRoot, entry.source || ""), "source 路径");
    const target = inside(contractsRoot, entry.local || "", "local 路径");
    const url = "https://raw.githubusercontent.com/" + repositoryPath + "/" + manifest.commit + "/" + entry.source;
    const response = await fetch(url, { redirect: "error" });
    if (!response.ok) fail("同步失败 " + entry.source + ": HTTP " + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== entry.sha256) fail("远端 " + entry.source + " SHA-256 不匹配");
    JSON.parse(bytes.toString("utf8"));
    await writeFile(target, bytes);
  }
  await verify(manifestPath);
  return manifest;
}

async function main() {
  const [command = "verify", manifestArg] = process.argv.slice(2);
  const manifestPath = path.resolve(manifestArg || DEFAULT_MANIFEST);
  const manifest = command === "verify" ? await verify(manifestPath) : command === "sync" ? await sync(manifestPath) : fail("未知命令: " + command);
  console.log("契约 " + command + " 通过: " + manifest.commit + " (" + manifest.schemas.length + " files)");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
