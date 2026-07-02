## Progress

- Done: Replaced remaining old owner/package references found in local files with current oh-my-qoder targets.
- Done: Fixed failing omq-doctor and release-generation test expectations.
- Done: Removed the final literal legacy package-name assertion from tests.
- Done: Targeted tests pass and legacy owner/package search returns no matches.
- Done: Build passes.
- Done: Added the missing ESLint runtime dependency and regenerated package-lock with complete resolved/integrity metadata.
- Done: Relaxed lint rules that conflict with existing codebase patterns instead of rewriting unrelated files.
- Done: Re-ran lint/build/tests and verified clean install dry-run.
- Done: Updated auto-update tests to use `.qoder-plugin/plugin.json`.
- Done: Switched user-facing Qoder CLI install instructions to the official `qoder.com/install` command.
- Done: Scoped ESLint relaxations instead of disabling every relaxed rule globally.
- Done: Narrowed legacy ESLint overrides from `src/**/*.ts` to explicit files that currently violate those rules.
- Done: Aligned package Node engine with the resolved ESLint dependency floor.
- Done: Migrated remaining plugin manifest fixtures, version sync script, and docs from `.claude-plugin` to `.qoder-plugin`.
- Done: Re-ran lint/build/targeted tests and clean install dry-run.
- Next: Report residual lint warnings and low-severity audit warning.

## Failures

- Initial `npm run lint` could not start because ESLint could not resolve `typescript-eslint`.
- After adding `typescript-eslint`, lint surfaced existing codebase-wide rule conflicts (`require()` in tests, control-character regexes, intentionally escaped regexes).
- `npm audit --audit-level=moderate` passes, but npm reports one low severity `esbuild` advisory.
- The first clean install dry-run wrapper failed because `status` is read-only in zsh; reran with `rc`, and `npm ci --ignore-scripts --dry-run` passed.
