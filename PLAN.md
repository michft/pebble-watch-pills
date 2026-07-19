# Pebble Pills — Implemented Plan

Status: complete

Target: Pebble Time 2 / rePebble `emery`

Date: 2026-07-19

## Product

Small watch-first pill reminder with four independent daily slots and a phone-local adherence report.

Each slot has:

- fixed label `Pill 1` through `Pill 4`
- enabled/disabled state
- editable local hour and minute
- next logical scheduled occurrence

Defaults: 08:00, 12:00, 18:00, 22:00. Watch remains source of truth for settings and scheduling.

At each reminder, record exactly one outcome:

- `Taken`: user self-reports taking pill
- `Skipped`: user reports not taking pill
- `No response`: reminder fired without explicit choice

App never infers consumption, gives dosage advice, or calls report a medical record.

## Delivered scope

- four persistent watch-editable slots
- local-time daily scheduling
- one rolling OS wakeup for earliest enabled slot
- wake vibration and full-screen outcome prompt
- two-minute minimum gap between enabled slots
- elapsed-reminder recovery on next app launch
- newest 128 watch events with visible dropped-event warning on phone
- automatic and manual watch-to-phone sync
- duplicate-safe 90-day phone history
- Today, 7-day, and 30-day phone reports
- detailed daily outcomes and current settings snapshot
- confirmed phone-history clear action
- no account, backend, analytics, cloud backup, or health integration

## Architecture

```text
Pebble Time 2
  native C app
    state + persistence
    button UI
    wakeup scheduler
    outcomes
    AppMessage sender
          |
          | rePebble AppMessage
          v
Phone / rePebble app
  PebbleKit JS
    localStorage
    identity dedupe
    offline report/config page
```

Files:

```text
src/c/main.c                 watch runtime
src/pkjs/index.js            phone message bridge and storage
src/pkjs/report-page.js      phone report HTML
src/embeddedjs/model.ts      testable domain/reference model
tests/                       automated and manual validation
```

Native C replaced an initial Alloy/Piu prototype. Emulator testing found Alloy message buffers and redraws unstable under the required combined workload. Native app uses about 10 KB static RAM and leaves about 121 KB heap on Emery.

## Watch behavior

### Main screen

- Up/Down chooses one of four slots.
- Select opens editor.
- Long Select sends report data to phone.
- Back exits.
- Times follow watch 12/24-hour preference.

### Editor

- Up/Down chooses Enabled, Hour, Minute, or Save.
- Select toggles Enabled, increments hour, increments minute by five, or saves.
- Back cancels unsaved changes.
- Save is blocked when enabled slots are under two minutes apart, including across midnight.
- A save immediately recalculates rolling wakeup.

### Reminder alert

- Reminder event is created as `No response` before user input.
- Select changes same event to `Taken` and records answer time.
- Down changes same event to `Skipped` and records answer time.
- Back leaves `No response` unchanged.
- Next occurrence is scheduled before waiting for response.

## Scheduling

For every enabled slot, calculate next local occurrence with at least 60 seconds lead time. Only earliest occurrence is registered with Pebble Wakeup service.

On fire:

1. Create/deduplicate event from saved slot and scheduled timestamp.
2. Clear fired occurrence.
3. Recalculate all next occurrences.
4. Register new earliest wakeup.
5. Vibrate and show alert.

On normal launch, any saved occurrence already in past becomes one deduplicated `No response` event before schedule reconciliation.

When all slots disabled, no OS wakeup remains. If registration fails, watch shows `Alarm schedule failed` and logs Pebble error code.

Timezone changes cannot reliably wake closed app. User must open app once after travel to recalculate against new local timezone.

## Persistence

Watch persists one versioned binary state containing:

- installation ID
- sequence counter
- settings revision
- four slots and next occurrences
- newest 128 events
- dropped-event counter

Invalid size, version, or event count resets to safe defaults. Queue overflow drops oldest event and increments dropped count.

Phone persists versioned JSON in PebbleKit JS `localStorage`:

- newest 90 days of events
- last settings snapshot
- last successful sync time
- highest dropped-event count observed
- storage warning, if recovery was needed

## Sync protocol

Sync is one-way watch to phone. Phone sends `REQUEST_SYNC` when bridge becomes ready or report opens. User can also hold Select.

Watch sends sequentially:

1. `SETTINGS_SNAPSHOT`
2. one `EVENT_BATCH` per retained event
3. `SYNC_DONE`

Every event identity is `installId + sequence`. Watch resends all retained events. Phone upserts by identity, so retry after interruption is idempotent. Failed phone storage loses no watch history; next sync retries retained events.

Payload timestamps use epoch milliseconds. Event also stores watch-local `YYYY-MM-DD` so report groups by reminder-day semantics.

No reminder or report data uses network services, query strings, analytics, or console logging.

## Phone report

Opened from app gear/config action inside rePebble mobile app. Page is generated locally as a data URL and needs no network.

Shows:

- last sync time and stale warning after 24 hours
- dropped-history warning
- Today: taken, skipped, no response, percentage
- Last 7 days: same summary
- Last 30 days: same summary
- expandable daily details
- read-only current reminder times
- confirmed `Clear phone report`

Wording says `Self-reported taken`. `No response` does not assert missed dose.

Clearing removes phone event history only. Retained watch history may return on next sync.

## Validation

Automated tests cover:

- defaults
- same-day and next-day scheduling
- midnight collision detection
- event deduplication and outcome update
- retained-history ordering
- 128-event overflow behavior
- invalid persisted settings rejection
- phone report wording, stale warning, and HTML escaping

Manual cases live in:

- `tests/scheduler-cases.md`
- `tests/sync-protocol-cases.md`

Release checks:

- `pnpm test`
- `pebble clean`
- `pnpm build`
- install `build/pebble-pills.pbw` on Emery
- verify main/editor/sync UI and wakeup capability
- repeat wake, reboot, timezone, disconnect, and overflow cases on physical Pebble Time 2 before relying on it

## Known limits

- self-report tool, not medical device
- no snooze
- no medication names or dosage
- no phone-side time editing
- no guaranteed phone background sync while watch app closed
- phone report has device-local storage only
- SDK 4.17 Emery automation became unresponsive during repeated edit/save button sequences; editor entry, initial UI, packaging, and wakeup capability were verified, but physical save/wakeup testing remains a release gate
- physical Pebble Time 2 wake/reboot testing still required before personal daily use

## Future options

Not in v1:

- medication names and dosage
- snooze
- phone-side schedule editing and two-way conflict resolution
- encrypted export or cloud backup
- caregiver sharing
- HealthKit/Health Connect integration
