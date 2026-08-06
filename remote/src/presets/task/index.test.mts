import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { main, nextTaskFromLedger, parseCli, runIteration, type MainDeps } from "./index.mts";
import type { NextTask } from "./state.mts";
import { resolvePhases } from "../../lib/profiles.mts";
import type { RunDeps, RunSandbox } from "../../lib/run.mts";
import type { PhaseRunOptions, PhaseRunResult } from "../../phases/context.mts";
import { VERIFY_COMPLETE } from "../../phases/verify.mts";

function makeDeps(
  overrides: { nextTask?: NextTask; syncMain?: boolean } = {},
): MainDeps & { iterations: NextTask[] } {
  const iterations: NextTask[] = [];
  return {
    iterations,
    syncMain: async () => overrides.syncMain ?? true,
    nextTask: () =>
      overrides.nextTask ?? { label: "1.4 Nature kit data", branch: "agent/1-4-nature-kit-data" },
    runIteration: async (_run, next) => {
      iterations.push(next);
      return { prUrl: `https://example.test/pr/${iterations.length}` };
    },
    log: () => {},
  };
}

test("parseCli defaults to one iteration and rejects an out-of-range count", () => {
  assert.deepEqual(parseCli([]), {
    iterations: 1,
    task: undefined,
    profile: undefined,
    model: undefined,
  });
  // Morrow's retired --agent flag must fail loudly, not silently run the
  // mixed default through unattended squash-merges.
  assert.throws(() => parseCli(["--agent", "claude", "--iterations", "3"]), /unknown flag --agent/);
  assert.throws(() => parseCli(["--iterations", "0"]), /between 1 and 20/);
  assert.throws(() => parseCli(["--iterations", "21"]), /between 1 and 20/);
  assert.throws(() => parseCli(["--iterations", "many"]), /between 1 and 20/);
  assert.deepEqual(parseCli(["--iterations", "3", "--task", "1.4 Nature", "--profile", "claude"]), {
    iterations: 3,
    task: "1.4 Nature",
    profile: "claude",
    model: undefined,
  });
});

test("an explicit --task pins only the first iteration; the rest follow the ledger", async () => {
  const deps = makeDeps();
  const prUrls = await main({ iterations: 3, task: "2.1 RNG" }, deps);

  assert.equal(prUrls.length, 3);
  assert.deepEqual(deps.iterations[0], { label: "2.1 RNG", branch: "agent/2-1-rng" });
  assert.deepEqual(deps.iterations[1]!.label, "1.4 Nature kit data");
  assert.deepEqual(deps.iterations[2]!.label, "1.4 Nature kit data");
});

test("a main that will not fast-forward stops the loop before any work", async () => {
  const deps = makeDeps({ syncMain: false });
  await assert.rejects(main({ iterations: 2 }, deps), /resolve main before looping/);
  assert.deepEqual(deps.iterations, []);
});

test("a malformed ledger stops the loop rather than guessing a task", () => {
  assert.throws(() => nextTaskFromLedger("# STATE.md\n\nNo entries yet."), /fix the ledger/);
  assert.deepEqual(nextTaskFromLedger("- Next task: **2.1 RNG**"), {
    label: "2.1 RNG",
    branch: "agent/2-1-rng",
  });
});

test("an unknown profile is rejected before the first sandbox is built", async () => {
  const deps = makeDeps();
  await assert.rejects(main({ iterations: 1, profile: "gemini" }, deps), /Unknown workflow profile/);
  assert.deepEqual(deps.iterations, []);
});

test("a model override without a named profile is rejected", async () => {
  const deps = makeDeps();
  await assert.rejects(
    main({ iterations: 1, model: "gpt-5.6" }, deps),
    /requires a single-agent route/,
  );
  assert.deepEqual(deps.iterations, []);
});

/**
 * `openRun`'s seam, faked: the real `runIteration` lifecycle runs against a
 * sandbox that records every session and answers from `results` in order.
 * `createAgent` returns a fresh object per call — plan, task, review, in that
 * order — so which agent a phase ran can be checked by identity.
 */
function fakeRunDeps(results: PhaseRunResult[]) {
  const runs: PhaseRunOptions[] = [];
  const agents: unknown[] = [];
  const sandbox: RunSandbox = {
    run: async (options) => {
      runs.push(options);
      return results[runs.length - 1] ?? { commits: [] };
    },
    exec: async () => ({ stdout: "", exitCode: 0 }),
    close: async () => ({}),
    [Symbol.asyncDispose]: async () => {},
  };
  const deps: RunDeps = {
    createSandbox: async () => sandbox,
    createAgent: () => {
      const agent = {};
      agents.push(agent);
      return agent;
    },
    // Exit 1: no origin branch to resume, so no host git runs on a real repo.
    git: async () => ({ stdout: "", stderr: "", exitCode: 1 }),
  };
  return { deps, runs, agents };
}

// The iteration's two load-bearing choices, neither reachable from `main`'s
// injected `runIteration`: a task session that commits nothing gets ONE retry
// with a fresh context, and the verifier runs the REVIEW profile's agent — which
// is what makes a mixed run build with one model and check with another. Swapping
// in `taskCtx` there would still verify, just never independently.
test("a no-commit task is retried once and the verifier runs the review agent", async () => {
  const { deps, runs, agents } = fakeRunDeps([
    { commits: [] },
    { commits: ["landed"] },
    { commits: [], completionSignal: VERIFY_COMPLETE },
  ]);

  // A non-repo cwd so the host `git push` fails deterministically and reaches no
  // network; templates resolve through an override, the kit's own being outside
  // that workspace.
  const workspace = mkdtempSync(join(tmpdir(), "sandcastle-kit-"));
  mkdirSync(join(workspace, "tpl", "task"), { recursive: true });
  for (const file of TEMPLATES) writeFileSync(join(workspace, "tpl", "task", file), "prompt");
  const cwd = process.cwd();
  process.chdir(workspace);
  try {
    await assert.rejects(
      runIteration(
        { toolchain: "node", templateDir: "tpl" },
        resolvePhases(),
        { label: "2.1 RNG", branch: "agent/2-1-rng" },
        deps,
      ),
      /git push origin agent\/2-1-rng exited/,
    );
  } finally {
    process.chdir(cwd);
  }

  assert.deepEqual(
    runs.map((options) => options.name),
    ["task-agent/2-1-rng", "task-agent/2-1-rng-retry", "verify-agent/2-1-rng"],
  );
  const [, taskAgent, reviewAgent] = agents;
  assert.equal(runs[0]!.agent, taskAgent);
  assert.equal(runs[1]!.agent, taskAgent, "the retry must be the task agent, not a new one");
  assert.equal(runs[2]!.agent, reviewAgent, "the verifier must run the review profile's agent");
});

// Same contract the implement preset's templates are held to: a `{{ARG}}` the
// preset never supplies reaches the agent as a literal `{{ARG}}`, which reads as
// a corrupted prompt rather than an error.
const SUPPLIED = ["BRANCH", "TASK_LABEL", "CONVENTIONS", "VERIFY"];
const TEMPLATES = ["task-prompt.md", "verify-prompt.md"];

function templateSource(file: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../templates/task/${file}`, import.meta.url)), "utf8");
}

for (const file of TEMPLATES) {
  test(`every {{ARG}} in the default task/${file} is supplied by the preset`, () => {
    const used = new Set([...templateSource(file).matchAll(/\{\{([A-Z_]+)\}\}/g)].map((m) => m[1]!));
    const missing = [...used].filter((name) => !SUPPLIED.includes(name));
    assert.deepEqual(missing, [], `unsupplied placeholders in ${file}`);
  });
}

test("the ledger templates name no package manager or test runner", () => {
  // The donor's prompts said `dotnet build` and `dotnet test` outright, which
  // would have made every consumer of this preset a .NET repo.
  for (const file of TEMPLATES) {
    assert.doesNotMatch(
      templateSource(file),
      /\bdotnet\b|\buv run\b|\bpytest\b|\bpre-commit\b|\bnpm\b|\byarn\b|\bpnpm\b|\bcargo\b/,
      file,
    );
  }
});
