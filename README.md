# Pill Reminder for Pebble Time 2

Up to four daily reminder slots, explicit self-reported outcomes, and phone-local reporting for Pebble Time 2 (`emery`).

## Features

- Three-row scrolling reminder list with up to four independently enabled daily times.
- Bottom `+ Add reminder` item whenever unused reminder capacity remains.
- Physical-button operation.
- Persistent rolling wakeup while app is closed.
- Repeated vibration for a five-minute reminder window.
- `Taken`, `Skipped`, and `No response` outcomes kept distinct.
- Offline history with duplicate-safe phone sync.
- Today, 7-day, and 30-day report inside rePebble mobile app.
- No account, backend, analytics, or medication-data network requests.

`Taken` is self-reported. Report is not medical record or dosage advice.

## Build

Requirements:

- Python 3.10+
- `uv`
- Node.js 22.18.0+
- pnpm
- rePebble `pebble-tool` and current SDK

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

Package output: `build/pebble-pills.pbw`.

## CloudPebble deployment

The active browser project is
[CloudPebble project 22199](https://cloudpebble.repebble.com/ide/project/22199#).
Use it to build the current GitHub code and install it on the watch or Emery
emulator:

1. Sign in to CloudPebble using the Google account that owns the project.
2. Open project 22199 and sync the latest `main` through GitHub Repo Sync.
3. Build the project.
4. Run it using the phone target for the physical watch, or the Emery emulator
   for browser testing.

Phone deployment requires Cloud Dev Connection to be linked in CloudPebble
Settings and enabled in the rePebble iOS app. CloudPebble handles development
builds and watch installation; publishing a new app-store version remains the
separate release workflow below.

## Releases

The version in `package.json` is the release source of truth. Before merging a
release to `main`, increment that version and add the matching entry to
`CHANGELOG.md`. Successful deployments create a matching GitHub Release and
attach the `.pbw`, providing the release history.

Every push to `main` runs `.github/workflows/release.yml`, tests and builds the
app, uploads the new release to the Pebble app store, then creates the GitHub
Release. Configure these GitHub repository settings first:

- Secret `REBBLE_ACCESS_TOKEN`: the bearer access token from a signed-in
  Rebble Developer Portal session.

The workflow contains the public Developer Portal DB ID
`384b30aa3eeb468ba63a4f7e`; it is not the PBW UUID.

The portal access token can expire. Replace the secret if deployment returns
HTTP 401. A reused version fails before build; bump `package.json` and add its
changelog entry before retrying.

## Install

CloudPebble project 22199 is the primary watch deployment method. In the
rePebble mobile app: Devices → three-dot menu → Enable Dev Connect → sign into
GitHub, then use the CloudPebble project's phone target.

For command-line installation instead:

```sh
pebble login
pebble install --cloudpebble
```

Or install on Emery emulator:

```sh
pebble install --emulator emery
```

## Watch controls

Main screen:

- Up/Down: scroll enabled reminders and the add item.
- Select: edit a reminder, or open a new reminder from `+ Add reminder`.
- Hold Select: send report to phone now.

Edit screen:

- Up/Down: choose field.
- Select: toggle/increment/save.
- Back: cancel.

Reminder screen:

- Select or `Taken`: record self-reported taken.
- Down or `Skipped`: record skipped.
- Back: leave no response.
- The watch repeats its vibration every 30 seconds for five minutes, then closes the alert as `No response`.

## Phone report

Open app gear/config action in rePebble mobile app. Report uses PebbleKit JS local storage. Phone requests sync when watch app opens. Hold Select for manual sync. Watch resends retained history; phone deduplicates by watch install ID and sequence.

Phone settings are read-only in v1. Edit reminder times on watch.

## Limits

- Watch keeps newest 128 events; phone keeps 90 days.
- Enabled times require two-minute separation.
- App keeps one rolling OS alarm for the next enabled slot. Open watch app once after timezone travel to recalculate it.
- No guaranteed continuous background sync.
- Clearing phone report is irreversible. Retained watch history can return on next sync.
