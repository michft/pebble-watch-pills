# Agent instructions

Before declaring any task complete, perform all applicable housekeeping:

- Remove temporary files, debug code, stale comments, and artifacts created
  during the task.
- Keep generated output, dependencies, credentials, and local environment files
  out of version control; update `.gitignore` when needed.
- Update README instructions when setup, operation, deployment, or maintenance
  behavior changes.
- Update `CHANGELOG.md` and `package.json` together when preparing a release.
- Run focused tests and checks for changed files. Also run `git diff --check`.
  Do not run a development server or full build unless the user requested it.
- Review `jj status` and the final diff. Preserve unrelated user changes and
  identify anything unexpected before finishing.
- Report validations run, failures or skipped checks, remaining external setup,
  and all changed files in the final response.

Do not commit, push, publish, or create a release unless the user explicitly
requests that action.
