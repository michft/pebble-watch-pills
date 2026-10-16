# Agent instructions

Before declaring any task complete, perform all applicable housekeeping:

- Remove temporary files, debug code, stale comments, and artifacts created
  during the task.
- Keep generated output, dependencies, credentials, and local environment files
  out of version control; update `.gitignore` when needed.
- Update README instructions when setup, operation, deployment, or maintenance
  behavior changes.
- Update `CHANGELOG.md` and `package.json` together when preparing a release.
  Every PR to `main` releases, so it must bump the version: increase MAJOR or
  MINOR over the latest `v*` tag with PATCH 0 (MAJOR/MINOR at most 255). The
  watch binary only sees MAJOR.MINOR; this policy ensures its version changes
  on every release. Whether equal binary versions caused missed automatic
  updates remains unverified on device. Verify with `pnpm release:check`.
- Run focused tests and checks for changed files. Also run `git diff --check`.
  Do not run a development server or full build unless the user requested it.
- Review `jj status` and the final diff. Preserve unrelated user changes and
  identify anything unexpected before finishing.
- Report validations run, failures or skipped checks, remaining external setup,
  and all changed files in the final response.

Do not commit, push, publish, or create a release unless the user explicitly
requests that action.

## Native C verification: GCC is required

- A macOS `pnpm test` pass is not Linux/GCC evidence: macOS `cc` normally runs
  Clang. Native C and C test-harness changes must pass the Linux/GCC PR `test`
  check on the exact current head SHA before being reported ready to merge.
  Report pending, failed, or unavailable checks explicitly.
- Preserve `-Wall -Wextra -Werror`. Never suppress `format-truncation` just to
  make tests pass. Reproduce compiler diagnostics against the real affected
  harness where possible, then confirm the same compilation passes after fixing.
- Repeated release failure: GCC rejected a timezone-label `snprintf(..., "%s",
  source)` into a nine-byte buffer despite an earlier length guard. Bound the
  copy explicitly (for example, `%.*s` with `TIMEZONE_LABEL_LENGTH`) while keeping
  validation before copying. Test that eight-character labels survive intact
  and longer labels are rejected, rather than silently truncated and accepted.
