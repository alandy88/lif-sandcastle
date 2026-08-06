import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agents,
  describeRun,
  forwardedEnvKeys,
  phaseProfiles,
  profiles,
  resolvePhases,
  routes,
} from "./profiles.mts";

test("compatibility aliases derive from agents and routes", () => {
  assert.equal(profiles, agents);
  assert.deepEqual(phaseProfiles, {
    plan: agents[routes.mixed.plan],
    task: agents[routes.mixed.task],
    review: agents[routes.mixed.review],
  });
});

test("describeRun names only the phases the lifecycle runs", () => {
  const mixed = resolvePhases({});
  assert.match(describeRun(mixed), /plan .+, tasks .+, review /);
  const taskPreset = describeRun(mixed, ["task", "review"]);
  assert.doesNotMatch(taskPreset, /plan/);
  assert.match(taskPreset, /tasks .+, review /);
});

test("ignores non-routing agent labels", () => {
  const run = resolvePhases({ labels: ["agent:in-progress"] });
  assert.equal(run.name, "mixed");
});

test("routes via the agent:gpt label", () => {
  const run = resolvePhases({ labels: ["ready-for-agent", "agent:gpt"] });
  assert.equal(run.name, "gpt");
  assert.equal(run.phases.task.provider, "codex");
});

test("dispatch override wins over labels, even unknown ones", () => {
  const run = resolvePhases({ labels: ["agent:mystery"], dispatchProfile: "gpt" });
  assert.equal(run.name, "gpt");
});

test("dispatch value 'default' falls through to labels", () => {
  const run = resolvePhases({ labels: ["agent:gpt"], dispatchProfile: "default" });
  assert.equal(run.name, "gpt");
});

test("rejects an unknown dispatch profile", () => {
  assert.throws(() => resolvePhases({ dispatchProfile: "qwen" }), /Unknown workflow profile/);
});

test("rejects a model override that doesn't match the provider", () => {
  assert.throws(
    () => resolvePhases({ dispatchProfile: "gpt", modelOverride: "claude-opus-4-8" }),
    /does not look like a codex model id/,
  );
});

test("forwarded env keys are scoped to the providers in use", () => {
  // Both auth modes per provider: the bare token the CLI reads itself, and the
  // `<cli> login` credentials blob providerPreflight materializes to disk.
  assert.deepEqual(forwardedEnvKeys([profiles.claude]), [
    "GH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CREDENTIALS_JSON",
  ]);
  assert.deepEqual(forwardedEnvKeys([profiles.gpt]), [
    "GH_TOKEN",
    "OPENAI_API_KEY",
    "CODEX_AUTH_JSON",
  ]);
  assert.deepEqual(forwardedEnvKeys(Object.values(phaseProfiles)), [
    "GH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CREDENTIALS_JSON",
    "OPENAI_API_KEY",
    "CODEX_AUTH_JSON",
  ]);
});

test("resolvePhases defaults to the mixed phase map", () => {
  const run = resolvePhases({ labels: ["ready-for-agent"] });
  assert.equal(run.name, "mixed");
  assert.equal(run.phases.plan.model, "claude-opus-5");
  assert.equal(run.phases.task.model, "gpt-5.6-sol");
  assert.equal(run.phases.review.model, "claude-opus-5");
});

test("resolvePhases: a routing label forces every phase onto that profile", () => {
  const run = resolvePhases({ labels: ["ready-for-agent", "agent:claude"] });
  assert.equal(run.name, "claude");
  assert.equal(run.phases.plan.model, "claude-opus-5");
  assert.equal(run.phases.task.model, "claude-opus-5");
  assert.equal(run.phases.review.model, "claude-opus-5");
});

test("resolvePhases: dispatch 'mixed' overrides labels", () => {
  const run = resolvePhases({ labels: ["agent:gpt"], dispatchProfile: "mixed" });
  assert.equal(run.name, "mixed");
});

test("resolvePhases: a named default profile still forces a single-profile run", () => {
  const run = resolvePhases({ defaultProfile: "gpt" });
  assert.equal(run.name, "gpt");
  assert.equal(run.phases.plan.model, "gpt-5.6-sol");
});

test("resolvePhases: label routing errors fail closed", () => {
  assert.throws(() => resolvePhases({ labels: ["agent:mystery"] }), /Unknown agent label/);
  assert.throws(
    () => resolvePhases({ labels: ["agent:claude", "agent:gpt"] }),
    /multiple agent labels/,
  );
});

test("resolvePhases: a model override on a mixed run is rejected", () => {
  assert.throws(
    () => resolvePhases({ modelOverride: "gpt-5.6-sol" }),
    /requires a single-agent route/,
  );
});

test("resolvePhases: a model override applies to a forced single profile", () => {
  const run = resolvePhases({ labels: ["agent:gpt"], modelOverride: "gpt-5.6-luna" });
  assert.equal(run.phases.task.model, "gpt-5.6-luna");
});
