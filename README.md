# Pill Reminder for Pebble Time 2

Four daily reminder slots, explicit self-reported outcomes, and phone-local reporting for Pebble Time 2 (`emery`).

## Features

- Four independently enabled daily times.
- Physical-button operation.
- Persistent rolling wakeup while app is closed.
- `Taken`, `Skipped`, and `No response` outcomes kept distinct.
- Offline history with duplicate-safe phone sync.
- Today, 7-day, and 30-day report inside rePebble mobile app.
- No account, backend, analytics, or medication-data network requests.

`Taken` is self-reported. Report is not medical record or dosage advice.

## Build

Requirements:

- Python 3.10+
- `uv`
- Node.js
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

## Install

In rePebble mobile app: Devices → three-dot menu → Enable Dev Connect → sign into GitHub.

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

- Up/Down: choose slot.
- Select: edit.
- Hold Select: send report to phone now.

Edit screen:

- Up/Down: choose field.
- Select: toggle/increment/save.
- Back: cancel.

Reminder screen:

- Select or `Taken`: record self-reported taken.
- Down or `Skipped`: record skipped.
- Back: leave no response.

## Phone report

Open app gear/config action in rePebble mobile app. Report uses PebbleKit JS local storage. Phone requests sync when watch app opens. Hold Select for manual sync. Watch resends retained history; phone deduplicates by watch install ID and sequence.

Phone settings are read-only in v1. Edit reminder times on watch.

## Limits

- Watch keeps newest 128 events; phone keeps 90 days.
- Enabled times require two-minute separation.
- App keeps one rolling OS alarm for the next enabled slot. Open watch app once after timezone travel to recalculate it.
- No guaranteed continuous background sync.
- Clearing phone report is irreversible. Retained watch history can return on next sync.
