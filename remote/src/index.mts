export { templatePath } from "./lib/templates.mts";
export type { TemplatePathOptions } from "./lib/templates.mts";

export { capture, ghCapture, ghJson, hostGit, json } from "./lib/host-exec.mts";
export type { CaptureResult } from "./lib/host-exec.mts";

export {
  commitOnBranch,
  dropArtifacts,
  logSince,
  push,
  pushCheckpoint,
  resumeFromOrigin,
  syncMain,
} from "./lib/branch.mts";
export type { ExecSandbox, GitRunner } from "./lib/branch.mts";

export { defangPromptArgs, defangShellExpansion } from "./lib/defang.mts";

export { isEntrypoint } from "./lib/entrypoint.mts";

export { renderConventions, toolchains } from "./lib/toolchains.mts";
export type { Toolchain, ToolchainSpec } from "./lib/toolchains.mts";

export {
  checkOffTask,
  parseTaskDoneTrailers,
  parseTaskList,
  renderTaskList,
  stripTaskSection,
  taskDoneTrailer,
} from "./lib/task-list.mts";
export type { TaskItem } from "./lib/task-list.mts";

export { ensureTaskList, runChecklistLoop } from "./lib/task-loop.mts";
export type { ChecklistLoopDeps, ChecklistLoopResult } from "./lib/task-loop.mts";

export {
  agents,
  DEFAULT_PROFILE_SENTINEL,
  describeRun,
  forwardedEnvKeys,
  MIXED_PROFILE_NAME,
  phaseProfiles,
  PROFILE_LABELS,
  profiles,
  resolvePhases,
  routes,
} from "./lib/profiles.mts";
export type {
  AgentName,
  Effort,
  ModelProfile,
  Phase,
  ProfileName,
  ProfileResolutionInput,
  Provider,
  ResolvedPhases,
  RouteName,
} from "./lib/profiles.mts";

export {
  createAgent,
  createSandboxProvider,
  providerPreflight,
} from "./lib/provider-setup.mts";

export { openRun } from "./lib/run.mts";
// `RepoConfig` is what both presets alias; `RunDeps` (and the two types it names)
// is the parameter `runIssue`/`runIteration` take. `RunInput` and `RunHandle` are
// `openRun`'s own argument and return, reachable through it and not worth
// freezing into the package's public surface.
export type { RepoConfig, RunDeps, RunSandbox, RunSandboxOptions } from "./lib/run.mts";

export {
  commentOnIssue,
  getIssue,
  githubIssueSource,
  issueIsEpic,
  setIssueBody,
} from "./lib/github-issue.mts";
export type { Issue, IssueBodySource } from "./lib/github-issue.mts";

export { readFlag } from "./lib/cli.mts";

export { deliverPullRequest } from "./lib/github-pr.mts";
export type { DeliverInput, DeliverResult, DeliverDeps } from "./lib/github-pr.mts";

// Phases (./phases/*) and presets (./presets/*) are imported by subpath, not
// re-exported: a consumer picks the lifecycle it runs, or composes the stages
// itself, and neither should arrive by importing the kit's root.
