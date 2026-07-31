# Number Watch with Pill Reminders

Pebble Time 2 (`emery`) watchapp displaying local time or a fixed UTC offset as
lowercase English number words. Four retained pill reminders interrupt the time
display when due.

See [Using the app](docs/using-the-app.md) for current controls, phone
synchronisation, and troubleshooting.

Time uses one word per line. Phrases containing at most three words split long
teen words at spoken syllable boundary:

```text
eight       twelve
seven       twenty
-teen       seven
```

Watch follows its 12/24-hour system preference, updates every minute, speaks
minutes one through nine as `o' one` through `o' nine`, and omits minutes at
`:00`.

## Watch controls

- Time display: Select opens the reminder list.
- Reminder list: Up/Down moves; Select edits; hold Select syncs the phone report;
  Back returns to time.
- Reminder editor: Up/Down chooses a field; Select changes or saves; Back cancels.
- Reminder alert: upper-right Up acknowledges and records Taken; Back dismisses
  without changing No response.

## Settings

Edit reminder times with the watch controls above or open Number Watch settings
in the rePebble phone app. Phone page also controls:

- four pill reminder times and enabled state
- displayed time: watch-local time or a fixed UTC offset from UTC-12:00 through
  UTC+14:00 in 15-minute steps
- time format follows the watch's 12/24-hour system setting
- horizontal alignment: left, centre, right
- vertical alignment: top, middle, bottom
- font size: small, medium, large
- independent text and background colours

Save sends complete configuration to watch atomically, then requests a fresh
watch-to-phone report sync. Enabled reminders must remain at least two minutes
apart. A fixed UTC offset does not adjust for daylight saving time and changes
only the word-time display; reminder schedules remain in the watch's local
time. Watch persists configuration and reschedules the next wakeup. Taken means
self-reported. Report is not medical record.

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
- Fixed 24-hour repeating reminder schedule; four slots.
- Phone history retained locally for 90 days; watch retains latest 128 events.
