import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runDataMigrations } from "./data-migrations";

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-migrate-"));
  await mkdir(path.join(root, "conversations"), { recursive: true });
  await mkdir(path.join(root, "personas"), { recursive: true });
  const legacyConversation = {
    conversations: [
      {
        id: "conv_123456",
        title: "旧会话",
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
        mode: "chat",
        messages: [{ id: "msg_123456", role: "user", content: "你好" }],
      },
    ],
  };
  const legacyPersona = { personas: [{ id: "persona_1", name: "闵先生", description: "班主任", firstMessage: "你好" }] };
  await writeFile(path.join(root, "conversations", "7.json"), JSON.stringify(legacyConversation));
  await writeFile(path.join(root, "personas", "7.json"), JSON.stringify(legacyPersona));
  return root;
}

test("dry-run reports changes without writing", async () => {
  const root = await fixture();
  try {
    const report = await runDataMigrations({ dataDir: root, dryRun: true });
    assert.equal(report.dryRun, true);
    assert.equal(report.changed, 2);
    const raw = await readFile(path.join(root, "conversations", "7.json"), "utf8");
    assert.equal(JSON.parse(raw).schemaVersion, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migration writes schemaVersion, keeps backup and produces checksums", async () => {
  const root = await fixture();
  const backup = path.join(root, "backup");
  try {
    const report = await runDataMigrations({ dataDir: root, backupDir: backup });
    assert.equal(report.rolledBack, false);
    assert.equal(report.changed, 2);
    assert.equal(report.checksums.length, 2);
    const upgraded = JSON.parse(await readFile(path.join(root, "conversations", "7.json"), "utf8"));
    assert.equal(upgraded.schemaVersion, "1.0");
    assert.equal(upgraded.conversations[0].schemaVersion, "1.0");
    assert.equal(upgraded.conversations[0].messages[0].schemaVersion, "1.0");
    const backupRaw = await readFile(path.join(backup, "conversations", "7.json"), "utf8");
    assert.equal(JSON.parse(backupRaw).schemaVersion, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("migration rolls back previous files when a later file fails", async () => {
  const root = await fixture();
  try {
    await mkdir(path.join(root, "conversations", "8.json"));
    const backup = path.join(root, "backup");
    await assert.rejects(runDataMigrations({ dataDir: root, backupDir: backup }));
    const raw = await readFile(path.join(root, "conversations", "7.json"), "utf8");
    assert.equal(JSON.parse(raw).schemaVersion, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
