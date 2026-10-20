# Number Watch with Pill Reminders

Pebble Time 2 (`emery`) watchapp displaying a named Home timezone plus up to
three enabled timezone entries, each independently showing lowercase English
number words or digits. Multiple entries may use the same timezone.
Up to four pill reminders interrupt the time display when due.

See [Using the app](docs/using-the-app.md) for current controls, phone
synchronisation, and troubleshooting.

Words mode (default) uses one word per line. At Large font size, `seventeen`
exceeds the available line width and splits at its spoken syllable boundary:

```text
eight       twelve
seven       twenty
-teen       seven
```

Words mode follows the watch's 12/24-hour system preference, updates every
minute, speaks minutes one through nine as `o' one` through `o' nine`, and omits
minutes at `:00`.

Optional Digits mode always shows hours (0–23) on the top row and
minutes (0–59) on the bottom row, without leading zeroes. Both rows remain
visible at midnight and exact hours. Digits use enlarged bold fonts (88, 96,
or 104px for Small, Medium, or Large) so both rows fill most of the display.
Words retain their existing font sizes. Alignment, colours, timezone switching,
and reminders work the same in both modes.

## Watch controls

- Time display: Up/Down cycles backward/forward through checked timezone labels.
  Hold Down opens Configuration. Home is selected whenever settings change.
- Configuration: Up/Down moves. Hold Down enters Reminders, Timezones, or Phone
  Report. Hold Up exits to the watchface.
- Reminder and timezone lists: Up/Down moves. Hold Down enters or shows the
  selected item. Hold Up returns to Configuration.
- Reminder editor: Up/Down chooses a field. Hold Down enters a field, confirms
  its value, or saves. Hold Up cancels and returns to Reminders.
- Reminder alert: Up records Taken; Down dismisses and leaves it Not taken.

Select and Back are not app navigation controls, avoiding conflicts with their
Pebble system roles.

## Settings

Edit reminder times with the watch controls above or open Number Watch settings
in the rePebble phone app. Phone page also controls:

- up to four pill reminder times and enabled state
- Home plus up to three checked named timezones, each with label and one of 20 vivid colour schemes
- phone appearance: Auto, Light (black on white), or Dark (white on black)
- time display per timezone: Words (default) or Digits; Words and reminder times follow the
  watch's 12/24-hour system setting, while Digits always use 24-hour time
- horizontal alignment: left, centre, right
- vertical alignment: top, middle, bottom
- font size: small, medium, large

Search timezones by city or IANA name, then choose from the filtered dropdown.
Search ignores case, spaces, and separators; skipped letters work too
(`sydny` finds `Australia/Sydney`). Choosing fills the full timezone name and
suggests its label, which you can edit. Typing alone keeps the current timezone;
clear the search to browse all available names. Saved names and aliases remain
selectable even on phones with a shorter timezone list. Type a valid full IANA
name to offer it in the dropdown when it is missing from the phone's shortlist.

Only checked reminders and timezones remain visible on the phone page; use the
Add buttons at each list's bottom to enable another. Clearing a time or label
before disabling its row preserves the previous saved value, so hidden rows do
not block Save. Save sends complete
configuration to watch atomically, then requests a fresh watch-to-phone report
sync. Failed delivery or missing watch confirmation makes up to three attempts,
and the phone keeps saved settings pending until the watch snapshot confirms
them. Reopening phone settings retries pending changes; keep Number Watch open
on the connected watch. Watch reminder/timezone lists refresh when changes arrive,
and overlapping report requests retain the latest settings snapshot. Enabled
reminders must remain at least two minutes apart. Phone resolves
IANA daylight-saving rules for every timezone on bridge connection, settings
save, and report sync, then sends current offsets plus next transitions.

Reminder times and daily dose limits use Home calendar days. Each Home day has
at most one outcome per enabled reminder slot, so two expected pills produce
two Taken/Not taken rows, never a third Taken row. Scheduled and answered times
are stored as UTC instants. The phone snapshots the Home timezone/day when it
first receives an event. A Taken row can render its actual answer instant in
any checked timezone, including different dates on travel or daylight-saving
days. Taken means self-reported. Report is not a medical record.

**Report history** can keep the last 7 or 30 days, or clear everything. Save the
records selected for removal to a JSON file before clearing if required. Later
synchronisation ignores retained watch events scheduled before the selected
cutoff while accepting newer events. The watch's retained history is unchanged.

## Emulator examples

Screenshots are saved in [`docs/screenshots`](docs/screenshots):

- [`emery_screenshot.png`](docs/screenshots/emery_screenshot.png) — default app-store screenshot at `21:23`
- [`twelve-twenty-seven.png`](docs/screenshots/twelve-twenty-seven.png) — preferred large centred layout
- [`eight-seventeen.png`](docs/screenshots/eight-seventeen.png) — syllable split
- [`twelve-thirty.png`](docs/screenshots/twelve-thirty.png)
- [`one-six.png`](docs/screenshots/one-six.png)
- [`one-twenty.png`](docs/screenshots/one-twenty.png) — final-line descender check
- [`left-top-green-medium.png`](docs/screenshots/left-top-green-medium.png) — position, size, colour config
- [`right-bottom-yellow-small.png`](docs/screenshots/right-bottom-yellow-small.png) — second position/colour config
- [`pill-reminder-alert.png`](docs/screenshots/pill-reminder-alert.png) — live wakeup interruption

## Build

Requirements:

- Python 3.10+
- `uv`
- Node.js 22.18.0+
- pnpm
- rePebble `pebble-tool` and current SDK
- C compiler for native formatter tests (`CC`, default `cc`; CI uses `gcc`)

One-time SDK setup (versions match the release workflow pins):

```sh
uv tool install pebble-tool==5.0.40
pebble sdk install 4.33.1
```

Project commands:

```sh
pnpm install
pnpm test
pnpm release:check
pnpm build
```

`pnpm release:check` validates the release metadata described under
[Releases](#releases). To run C harnesses with GCC locally, use
`CC=gcc pnpm test` (on macOS, `gcc` is usually Clang; install a real GCC).

Package output: `build/pebble-watch-pills.pbw`.

Install on Emery emulator:

```sh
pebble install --emulator emery build/pebble-watch-pills.pbw
```

## Local CodeRabbit review

Automatic GitHub reviews are disabled in `.coderabbit.yaml`. Authenticate once,
then review the current jj working-copy changes manually:

```sh
cr auth login
cr auth status
cr review --uncommitted --include-untracked --base main
```

## CloudPebble deployment

Active browser project:
[CloudPebble project 22199](https://cloudpebble.repebble.com/ide/project/22199#).

1. Sign in using Google account owning project.
2. Sync latest `main` through GitHub Repo Sync.
3. Build project.
4. Run using phone target or Emery emulator.

Phone deployment requires Cloud Dev Connection linked in CloudPebble Settings
and enabled in rePebble iOS app.

## Releases

### Pull request checks

Pull requests targeting `main` run on Linux with `CC=gcc`. The job fails unless
the compiler really is GCC, the PR diff passes `git diff --check`, the version
is release-worthy (below), and `pnpm test` passes, including native C harnesses
built with warnings treated as errors (`-O2 -Wall -Wextra -Werror`). The job
then builds the PBW with the pinned Pebble SDK, because host harnesses compile
against stub headers in `tests/host/` and cannot catch real SDK API mismatches.
For native C or C test-harness changes, a macOS `pnpm test` pass is insufficient:
macOS `cc` normally uses Clang. Confirm the Linux PR `test` check passes on the
current head SHA before merging; an earlier commit's green check does not count.

This caught a repeated release failure in the timezone-label sync harness:
GCC reported `-Werror=format-truncation` for an unbounded `%s` copy into a
nine-byte buffer, even after a length check. Keep warnings fatal and bound the
copy explicitly. Preserve rejection of oversized labels and test that all eight
allowed characters survive; do not turn invalid input into an accepted truncation.

### Versioning rule

`package.json` version is release source of truth, and every merge to `main`
releases it, so **every PR to `main` must bump the version** and add a matching
`CHANGELOG.md` entry.

Each release must increase MAJOR or MINOR over the latest released `v*` tag,
with PATCH `0` and MAJOR/MINOR at most 255 (for example `0.2.18` → `0.3.0`).
The Pebble SDK stores only MAJOR.MINOR in the watch binary and discards PATCH.
All `0.2.x` releases therefore share binary version `0.2`. Equal binary versions
may explain reports of watches keeping an older build until reinstall, but
that cause has not been confirmed on a device. This policy ensures every
release changes the binary version.

`pnpm release:check` (`scripts/release-metadata.js`) enforces this. It checks
the X.Y.0 format, the matching `CHANGELOG.md` entry, the 200×228 store
screenshot, and compares against the highest `v*` git tag (run
`git fetch --tags` first). Override the comparison with
`node scripts/release-metadata.js --previous v0.2.18` or
`RELEASE_PREVIOUS_VERSION`; `--require-previous` fails when no tag is found
(CI uses it).

### Release workflow

Push to `main` runs tests, builds the watchapp with pinned `uv`, `pebble-tool`,
and SDK versions, then:

1. creates a draft GitHub Release with the `.pbw` (drafts create no tag),
2. publishes the version to the Pebble app store and attaches
   `store-published.txt` to the draft as a record,
3. publishes the GitHub Release, creating the `v*` tag.

Secrets are exposed only to the steps that check or use them.
`CC=gcc` selects the compiler for native host tests. Both the PBW build and
`pebble publish` (which rebuilds the app) clear `CC` so the SDK selects ARM GCC.
The test suite exercises the publish step with synthetic credentials and
stand-in commands, without contacting the store.

Required GitHub repository secrets:

- `PEBBLE_FIREBASE_REFRESH_TOKEN`
- `PEBBLE_FIREBASE_API_KEY`

Sign in and pipe refresh token directly into GitHub without printing it:

```sh
pebble login
jq -r .refresh_token \
  "$HOME/Library/Application Support/Pebble SDK/oauth_firebase/firebase_oauth_storage.json" \
  | gh secret set PEBBLE_FIREBASE_REFRESH_TOKEN --repo michft/pebble-watch-pills
```

Copy Firebase Web API key, then store it without printing:

```sh
pbpaste | gh secret set PEBBLE_FIREBASE_API_KEY --repo michft/pebble-watch-pills
```

Workflow exchanges refresh token for short-lived Firebase ID token, then uses
supported `pebble publish` command. Existing store entry resolves from PBW UUID
`0b31b7f2-71e8-4610-830d-f7eaebef5494`; public app-store ID is
`384b30aa3eeb468ba63a4f7e`.

If auth revoked, run `pebble login`, update refresh-token secret, and retry.
A version that is already tagged, or not a MAJOR/MINOR increase, fails before
build; bump `package.json` and `CHANGELOG.md` first.

### Release recovery

Rerun the failed workflow (Actions → run → Re-run jobs); state lives in the
draft release:

- Failed before or during store upload: the rerun replaces the unpublished
  draft and uploads to the store again. If the store did accept the version but
  the job failed before recording it, check the store listing; if the version is
  live, attach a marker and rerun so the store step is skipped:
  `echo manual > store-published.txt && gh release upload vX.Y.0 store-published.txt`.
- Failed after the store upload was recorded: the rerun skips the store and
  only publishes the GitHub Release. Or finish it manually with
  `gh release edit vX.Y.0 --draft=false --latest`.
- A draft that recorded a store upload from a different commit blocks the
  release; publish that draft manually or bump the version in a new PR.

## Design reference

[Pebble Fuzzy Text International PT2](https://github.com/adamboutcher/Pebble-Fuzzy-Text-International-PT2)
was visual reference only. This repo keeps independent implementation; no
upstream code or assets copied.

## Limits

- Word display supports English only.
- Pebble Time 2 (`emery`) only.
- Home-calendar daily reminder schedule; up to four slots.
- Watch receives the current and next offset for offline timezone use; phone
  contact refreshes later daylight-saving transitions.
- Phone history retained locally for 90 days; watch retains latest 128 events.
