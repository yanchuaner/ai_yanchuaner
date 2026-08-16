import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { verify } from "./contracts.mjs";

const sourceRoot = path.resolve("contracts");

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-contracts-"));
  await cp(sourceRoot, root, { recursive: true });
  return { root, manifest: path.join(root, "manifest.json") };
}

async function mutateManifest(manifestPath, mutate) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  mutate(manifest);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

test("固定提交和摘要可离线校验", async () => {
  const { root, manifest } = await fixture();
  try { assert.equal((await verify(manifest)).commit, "6d9a2fbcb0c8ca5c6d02454404e25d0320add428"); }
  finally { await rm(root, { recursive: true, force: true }); }
});

test("文件被修改时拒绝", async () => {
  const { root, manifest } = await fixture();
  try {
    await writeFile(path.join(root, "schemas/error-envelope.v1.schema.json"), "{}\n");
    await assert.rejects(verify(manifest), /SHA-256 不匹配/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("manifest 提交 SHA 缺失时拒绝", async () => {
  const { root, manifest } = await fixture();
  try {
    await mutateManifest(manifest, (value) => delete value.commit);
    await assert.rejects(verify(manifest), /提交 SHA/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Schema JSON 无法解析时拒绝", async () => {
  const { root, manifest } = await fixture();
  try {
    const invalid = Buffer.from("{");
    await writeFile(path.join(root, "schemas/error-envelope.v1.schema.json"), invalid);
    const digest = createHash("sha256").update(invalid).digest("hex");
    await mutateManifest(manifest, (value) => {
      value.schemas.find((entry) => entry.name === "error-envelope").sha256 = digest;
    });
    await assert.rejects(verify(manifest), /Schema JSON 无法解析/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("路径越出允许目录时拒绝", async () => {
  const { root, manifest } = await fixture();
  try {
    await mutateManifest(manifest, (value) => { value.schemas[0].local = "../outside.schema.json"; });
    await assert.rejects(verify(manifest), /越出允许目录/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("父目录治理仓不存在时仍可离线校验", async () => {
  const { root, manifest } = await fixture();
  const previous = process.cwd();
  try {
    process.chdir(os.tmpdir());
    await verify(manifest);
  } finally {
    process.chdir(previous);
    await rm(root, { recursive: true, force: true });
  }
});
