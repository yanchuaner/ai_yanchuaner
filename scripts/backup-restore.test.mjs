import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const HELPER = path.resolve("scripts/ai-web-data-archive.sh");
const IMAGE = "busybox:1.36";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} 失败：${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function docker(args, options = {}) {
  return run("docker", args, options);
}

test("ai-web data archive helper preserves files across create/restore", async (t) => {
  const dockerCheck = spawnSync("docker", ["info"], { stdio: "ignore" });
  if (dockerCheck.status !== 0) {
    t.skip("当前环境没有可用的 Docker，跳过归档集成测试");
    return;
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-archive-test-"));
  const volume = `ai-web-archive-test-${process.pid}-${Date.now()}`;
  const archive = path.join(dir, "ai-web-data.tar.gz");
  try {
    docker(["run", "--rm", IMAGE, "true"]);
    docker(["volume", "create", volume]);
    docker([
      "run",
      "--rm",
      "-v",
      `${volume}:/data`,
      IMAGE,
      "sh",
      "-c",
      "mkdir -p /data/conversations /data/observability && printf 'hello' > /data/conversations/1.json && printf 'world' > /data/observability/events.jsonl",
    ]);

    run("bash", [HELPER, "create", archive, volume, IMAGE]);
    const listed = run("tar", ["-tzf", archive]);
    assert.match(listed, /conversations\/1\.json/);
    assert.match(listed, /observability\/events\.jsonl/);

    docker([
      "run",
      "--rm",
      "-v",
      `${volume}:/data`,
      IMAGE,
      "sh",
      "-c",
      "mkdir -p /data/personas && printf 'stale' > /data/personas/stale.json",
    ]);
    run("bash", [HELPER, "restore", archive, volume, IMAGE]);

    const conversation = docker([
      "run",
      "--rm",
      "-v",
      `${volume}:/data`,
      IMAGE,
      "cat",
      "/data/conversations/1.json",
    ]);
    const observability = docker([
      "run",
      "--rm",
      "-v",
      `${volume}:/data`,
      IMAGE,
      "cat",
      "/data/observability/events.jsonl",
    ]);
    assert.equal(conversation, "hello");
    assert.equal(observability, "world");
    docker(["run", "--rm", "-v", `${volume}:/data`, IMAGE, "sh", "-c", "[ ! -e /data/personas/stale.json ]"]);
  } finally {
    spawnSync("docker", ["volume", "rm", "-f", volume], { stdio: "ignore" });
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
