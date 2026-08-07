# Number Watch with Pill Reminders

Pebble Time 2 (`emery`) watchapp displaying a named Home timezone plus up to
three enabled travel timezones as lowercase English number words. Up to four
pill reminders interrupt the time display when due.

See [Using the app](docs/using-the-app.md) for current controls, phone
synchronisation, and troubleshooting.

Time uses one word per line. At Large font size, `seventeen` exceeds the
available line width and splits at its spoken syllable boundary:

```text
eight       twelve
seven       twenty
-teen       seven
```

Watch follows its 12/24-hour system preference, updates every minute, speaks
minutes one through nine as `o' one` through `o' nine`, and omits minutes at
`:00`.

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
- time format follows the watch's 12/24-hour system setting
- horizontal alignment: left, centre, right
- vertical alignment: top, middle, bottom
- font size: small, medium, large

Only checked reminders and timezones remain visible on the phone page; use the
Add buttons at each list's bottom to enable another. Save sends complete
configuration to watch atomically, then requests a fresh watch-to-phone report
sync. Enabled reminders must remain at least two minutes apart. Phone resolves
IANA daylight-saving rules for every timezone on bridge connection, settings
save, and report sync, then sends current offsets plus next transitions.

Reminder times and daily dose limits use Home calendar days. Each Home day has
at most one outcome per enabled reminder slot, so two expected pills produce
two Taken/Not taken rows, never a third Taken row. Scheduled and answered times
are stored as UTC instants. The phone snapshots the Home timezone/day when it
first receives an event. A Taken row can render its actual answer instant in
any checked timezone, including different dates on travel or daylight-saving
days. Taken means self-reported. Report is not a medical record.

**Clear phone report** removes phone-local history. Later synchronisation ignores
retained watch events scheduled before the clear, while accepting new events.
The watch's retained history is unchanged.

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
- C compiler for native formatter tests

One-time SDK setup:

```sh
uv tool install pebble-tool
pebble sdk install latest
```

Project commands:

```sh
pnpm install
pnpm test
pnpm build
```

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
cr review --plain --type uncommitted --base main
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

`package.json` version is release source of truth. Before merging release to
`main`, increment version and add matching `CHANGELOG.md` entry. Push to `main`
runs tests, builds watchapp, uploads Pebble app-store version, then creates
GitHub Release with `.pbw`.

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
Reused version fails before build; bump `package.json` and `CHANGELOG.md` first.

## Design reference

[Pebble Fuzzy Text International PT2](https://github.com/adamboutcher/Pebble-Fuzzy-Text-International-PT2)
was visual reference only. This repo keeps independent implementation; no
upstream code or assets copied.

## Limits

- English number words only.
- Pebble Time 2 (`emery`) only.
- Home-calendar daily reminder schedule; up to four slots.
- Watch receives the current and next offset for offline timezone use; phone
  contact refreshes later daylight-saving transitions.
- Phone history retained locally for 90 days; watch retains latest 128 events.
