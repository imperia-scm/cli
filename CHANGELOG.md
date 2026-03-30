# @imperiascm/cli

## 2.0.1

### Patch Changes

- Stabilize the `runServiceGroup` output-prefix test in CI so both service processes emit their prefixed readiness lines before shutdown begins.

## 2.0.0

### Major Changes

- Replace the previous `run`, `prepare`, `git-sync`, and `rebuild` command set with the new terminal-first flows: `launch-services`, `prepare-workspace`, `sync-repository`, `build-solution`, and `run-service`.
- Launch selected services directly from the terminal with shared preparation, persisted selection state, grouped service startup, and prefixed concurrent output for multi-service runs.
- Add `repositoryTasks.syncMaxConcurrentRepositories` and `repositoryTasks.buildMaxConcurrentRepositories` to allow configurable concurrent repository sync and backend build phases.
- Regenerate VS Code tasks around the `launch services via imperia-cli` flow, using the `... via imperia-cli` labels and a smaller generated task set for selection, preparation, and launch.
- Expand the published workspace config schema and README with richer descriptions, examples, and terminal usage guidance.

## 1.0.3

### Patch Changes

- Make the generated `imperia-cli: run` VS Code task the default build task so `Ctrl+Shift+B` opens the service selector.
- Rename generated VS Code task labels to the `... via imperia-cli` style while keeping the same generated task flow.

## 1.0.2

### Patch Changes

- Align GitHub repository metadata and generated schema URLs with the `imperia-scm/cli` repository.

## 1.0.1

### Patch Changes

- branding from cli to imperia-cli

## 1.0.0

### Major Changes

- Rename the published package to `@imperiascm/cli` and switch generated workspace artifacts from `imperia-cli` to `cli`.
