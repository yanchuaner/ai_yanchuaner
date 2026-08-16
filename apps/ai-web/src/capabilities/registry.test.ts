import assert from "node:assert/strict";
import test from "node:test";
import {
  capabilityRegistry,
  CAPABILITY_MANIFESTS,
  CapabilityRegistryError,
  createCapabilityRegistry,
  type CapabilityManifest,
} from "./registry";

const base: CapabilityManifest = {
  schemaVersion: "1.0",
  id: "text.chat.general",
  version: "1",
  displayName: "对话",
  modalities: { input: ["text"], output: ["text"] },
  streaming: true,
  billing: { mode: "platform", unit: "token" },
  availability: "preview",
  requiredScopes: ["ai.chat"],
  timeoutMs: 180_000,
  dataEgress: "platform",
  failureStrategy: "no_degrade",
};

test("default registry exposes stable capability ids", () => {
  assert.equal(capabilityRegistry.get("text.chat.general")?.requiredScopes[0], "ai.chat");
  assert.equal(capabilityRegistry.get("voice.tts")?.billing.mode, "byok");
  assert.equal(CAPABILITY_MANIFESTS.length, 8);
});

test("registry rejects duplicate ids", () => {
  assert.throws(
    () => createCapabilityRegistry([base, { ...base, displayName: "重复" }]),
    (error: unknown) => error instanceof CapabilityRegistryError && /重复/.test(error.message),
  );
});

test("registry rejects unknown scope", () => {
  assert.throws(
    () =>
      createCapabilityRegistry([
        { ...base, requiredScopes: ["ai.unknown" as CapabilityManifest["requiredScopes"][number]] },
      ]),
    (error: unknown) => error instanceof CapabilityRegistryError && /未知 scope/.test(error.message),
  );
});

test("registry rejects incomplete billing declarations", () => {
  assert.throws(
    () => createCapabilityRegistry([{ ...base, billing: { mode: "none", unit: "token" } }]),
    (error: unknown) => error instanceof CapabilityRegistryError && /计费/.test(error.message),
  );
  assert.throws(
    () => createCapabilityRegistry([{ ...base, billing: { mode: "platform", unit: "none" } }]),
    (error: unknown) => error instanceof CapabilityRegistryError && /计费/.test(error.message),
  );
});
