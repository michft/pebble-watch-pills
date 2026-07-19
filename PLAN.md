# Pebble Pills — Build Plan

Status: planning only

Target: Pebble Time 2 / rePebble `emery`

Date: 2026-07-19

## 1. Product decision

Build small pill-reminder app with four independent daily slots on Pebble Time 2. Add phone-local adherence report synced from watch.

Each slot has:

- enabled/disabled state
- editable local time
- fixed display name: `Pill 1` through `Pill 4`
- one scheduled wakeup ID

Default times: 08:00, 12:00, 18:00, 22:00. User edits them on watch.

At reminder, user records one explicit outcome:

- `Taken` — user says pill was taken
- `Skipped` — user says pill was not taken
- `No response` — reminder fired but user gave no outcome

Report must label `Taken` as self-reported. App must not infer consumption, provide dosage advice, or present report as medical record.

## 2. v1 sync boundary

`Sync` means one-way watch → phone transfer of settings snapshot and reminder outcomes.

- Watch remains source of truth for reminder times and scheduling.
- Phone holds report copy in PebbleKit JS `localStorage`.
- Report opens from app gear/config action inside rePebble mobile app.
- No standalone iOS/Android app.
- No account, server, analytics, cloud backup, or third-party health integration.
- Phone report remains usable when watch disconnected, using last synced data.

Phone-side editing of reminder times is out of scope. This avoids two-way conflict rules in v1. Add later only if required.

## 3. Technical direction

Use Alloy with TypeScript watch code and PebbleKit JS phone code.

Reasons:

- Pebble Time 2 is `emery`: 200×228 color touchscreen, four buttons, vibration.
- Alloy officially supports `emery` and provides wakeups, persistent storage, Piu UI, vibration, and watch-phone messages.
- TypeScript is supported for Alloy watch code.
- PebbleKit JS runs inside rePebble mobile app, receives AppMessages, persists report data, and opens config/report UI.

Do not use Pebble Datalogging for v1. It buffers well, but PebbleKit JS cannot receive it; it would require a native Android/iOS companion app.

Project shape:

```text
pebble-pills/
├── package.json                    # moddable project; target emery
├── wscript
├── resources/
│   └── images/
│       └── menu_icon.png
├── src/
│   ├── embeddedjs/
│   │   ├── main.ts                 # lifecycle + composition root
│   │   ├── model.ts                # strict domain types
│   │   ├── storage.ts              # settings/history persistence
│   │   ├── scheduler.ts            # wakeup reconciliation
│   │   ├── sync.ts                 # queued AppMessage protocol
│   │   └── ui/
│   │       ├── main-screen.ts
│   │       ├── edit-screen.ts
│   │       └── alert-screen.ts
│   ├── pkjs/
│   │   ├── index.js                # phone bridge + localStorage
│   │   └── report-page.js          # offline report/config page
│   └── c/
│       └── mdbl.c                  # generated Alloy entry point
└── tests/
    ├── scheduler-cases.md
    └── sync-protocol-cases.md
```

Use Piu for UI. Support touch plus standard Up/Down/Select/Back buttons. Keep PKJS code compatible with its runtime; do not force TypeScript where Pebble build expects plain JS.

## 4. Watch UX

### Normal launch

Main screen:

```text
PILL REMINDERS
1   08:00   ON
2   12:00   ON
3   18:00   ON
4   22:00   ON

Phone: 12 events pending
```

- Tap row or Select: edit selected slot.
- Swipe/Up/Down: move selection.
- Back: exit.
- Tap sync status or long-press Select: `Sync now`.
- Use watch 12/24-hour preference for display. Store canonical 24-hour hour/minute.

Edit screen:

1. Toggle `ON/OFF`.
2. Edit hour.
3. Edit minute in five-minute steps.
4. Save.

Saving persists slot, cancels only that slot's previous wakeup, schedules next occurrence, then shows success or precise error.

### Reminder launch

At due time:

- Wake app into full-screen `TAKE PILL N` alert.
- Show scheduled time.
- Run noticeable custom vibration once.
- `Taken`: save self-reported taken outcome.
- `Skipped`: save skipped outcome.
- Back/close without choice: leave outcome as no response.
- Schedule next daily occurrence before waiting for user input.
- Attempt phone sync after local save; never block alert or next reminder on phone connection.

Reminder event exists before user interaction. Later `Taken`/`Skipped` updates same event; it does not create a duplicate.

## 5. Phone report UX

Open app gear/config action in rePebble mobile app.

Report page shows:

- last successful sync time
- watch connection/sync freshness
- pending watch event count from last handshake
- today: taken / scheduled
- last 7 days: taken, skipped, no response
- last 30 days: same totals and percentage
- daily rows expandable to four slot outcomes
- current four reminder times as read-only snapshot
- `Clear phone report` behind confirmation

Use bundled/offline Clay-style page or embedded data-URI page. No remote report host. Never put medication outcomes in query strings, logs, analytics, or network requests.

Report wording:

- “Self-reported taken”, not “dose confirmed”.
- “No response”, not “missed dose”.
- Display “Last synced …” prominently; stale report must look stale.

## 6. Domain model

```ts
type SlotId = 0 | 1 | 2 | 3;
type Outcome = "no_response" | "taken" | "skipped";

interface ReminderSlot {
  id: SlotId;
  hour: number;          // 0..23
  minute: number;        // 0..59
  enabled: boolean;
  wakeupId: number | null;
  scheduledAt: number | null; // epoch ms
}

interface ReminderEvent {
  installId: string;
  sequence: number;
  slotId: SlotId;
  scheduledAt: number;   // epoch ms
  localDay: string;      // YYYY-MM-DD at reminder location
  timezoneOffset: number;
  outcome: Outcome;
  answeredAt: number | null;
}
```

`installId + sequence` forms stable sync identity. Phone deduplicates by that pair. New watch install cannot collide with old phone history.

Persist on watch:

- schema version
- install ID and next sequence
- four slots
- compact outcome event queue/history
- highest phone-acknowledged sequence
- dropped-event count

Validate every load. Invalid settings fall back to defaults. Invalid event entries are skipped and surfaced in logs/status.

Retention:

- Watch: newest 128 events, roughly 32 days at four/day.
- Phone: rolling 90 days.
- Watch deletes synced events older than 30 days after phone acknowledgment.
- If watch queue fills while disconnected, drop oldest acknowledged event first.
- If unsynced data must be dropped, increment visible `dropped-event count`; never hide data loss.

## 7. Scheduling rules

Use one one-shot Alloy `WakeUp` per enabled slot.

`nextOccurrence(slot, now)`:

1. Construct local `Date` for today's chosen hour/minute.
2. If candidate is too near or past, advance local calendar date by one.
3. Schedule with `WakeUp.schedule(candidateMs, slot.id, true)`.
4. Store returned wakeup ID and scheduled timestamp.
5. Query stored ID on next launch; discard stale/missing IDs.

Reconcile on app launch, after settings edit, after wakeup, and after detected clock/timezone change where supported:

- retain valid wakeups matching stored timestamp
- cancel wakeups for disabled slots
- replace stale or mismatched wakeups
- schedule missing enabled slots

Editing one slot changes only that slot. Never cancel all wakeups during ordinary edit.

Underlying Wakeup API allows at most eight events and reserves collision windows. Four daily slots fit. Prevent enabled times less than two minutes apart and surface scheduling failures.

DST/travel:

- Use local `Date` calendar operations, not fixed `24 * 60 * 60 * 1000` addition.
- Reconcile whenever app launches and after each reminder.
- After travel/timezone change, opening app resynchronizes already-scheduled UTC events.
- Store historical `localDay` + offset so report grouping does not change after travel.

## 8. Outcome rules

On wakeup:

1. Create event with `no_response` before drawing alert.
2. Persist event.
3. Schedule tomorrow's reminder.
4. Render alert and vibrate.
5. Update same event if user chooses `Taken` or `Skipped`.
6. Queue sync.

On startup reconciliation, if stored scheduled timestamp passed and no matching event exists, create `no_response`. This covers app interruption or watch being unavailable. Deduplicate through slot ID + scheduled timestamp.

Changing/disabling a future slot does not rewrite past report entries.

## 9. Sync protocol

Use Alloy `Message` on watch and PebbleKit JS `appmessage` on phone.

Message types:

- `HELLO`: install ID, schema version, latest sequence, pending count, settings revision.
- `PHONE_STATE`: phone's highest contiguous sequence for install ID.
- `EVENT_BATCH`: up to eight compact events.
- `ACK`: highest durably stored contiguous sequence.
- `SETTINGS_SNAPSHOT`: four read-only slot records + revision.
- `SYNC_DONE`: pending count zero.

Rules:

- Watch sends only after message channel becomes writable/PKJS ready.
- Phone writes batch to localStorage before sending acknowledgment.
- Watch removes/marks events synced only after ACK.
- Retry unacknowledged batches on next connection/app launch.
- Duplicate batches are harmless; phone upserts by `installId + sequence`.
- One batch in flight. Add timeout/backoff; no tight retry loops.
- Settings snapshot is revisioned and idempotent.
- Sync errors update watch status but never affect reminders.

Automatic sync attempts:

- normal app launch
- reminder launch after local event save
- user taps `Sync now`
- phone requests data while watch app is open

Limitation: PebbleKit JS runs with watch app, so this is opportunistic sync, not guaranteed continuous background sync.

## 10. Error behavior

Never claim schedule, save, or sync succeeded without confirmation.

- Wakeup collision: “Times too close”.
- Wakeup capacity: “No alarm slots”.
- Wakeup internal failure: “Schedule failed”.
- Watch storage failure: “Save failed”; retain safe in-memory state for session.
- Phone unavailable: “Phone offline — queued”.
- AppMessage timeout: keep event queued; retry later.
- Phone storage failure: no ACK; watch retains data.
- Queue overflow: show dropped-event warning on watch and report.
- Corrupt phone history: preserve parseable records, show report warning.

Main screen marks enabled-but-unscheduled slot with `!`.

## 11. Implementation phases

### Phase 0 — Tooling and capability spike

- Install current `pebble-tool` through `uv`; install latest SDK.
- Scaffold temporary Alloy project with `pebble new-project --alloy`.
- Confirm TypeScript, Piu, WakeUp, Vibes, Message, localStorage, and Emery emulator.
- Measure AppMessage payload limits and confirm Clay/data-URI report behavior in current rePebble mobile app.
- Verify wakeup minimum lead time/collision behavior on current Emery firmware.
- Copy only required scaffold into existing repo.

Exit: minimal TypeScript Alloy app builds/packages for Emery; phone PKJS handshake proven.

### Phase 1 — Four-slot watch UI

- Add launcher metadata/icon.
- Build touch/button main and edit screens.
- Add 12/24-hour formatting.
- Keep defaults in memory.

Exit: all four slots editable during one app session.

### Phase 2 — Settings persistence

- Add versioned storage, defaults, validation, and migrations.
- Save four slot settings.
- Verify restart/reboot/update retention.

Exit: settings survive lifecycle events.

### Phase 3 — Wakeups

- Add next-occurrence calculation and per-slot reconciliation.
- Handle wakeup launch and foreground wakeup through same function.
- Reschedule next day before alert interaction.
- Add visible errors.

Exit: four enabled slots fire daily while app closed.

### Phase 4 — Outcomes and watch history

- Create `no_response` event at wakeup.
- Add `Taken` and `Skipped` actions.
- Add 128-event retention and deduplication.
- Add custom vibration.

Exit: reportable, explicit outcomes persist locally without phone.

### Phase 5 — Reliable phone sync

- Add handshake, batching, ACK, retry, dedupe, and settings snapshot.
- Add watch sync status and manual sync action.
- Store 90-day phone history in PKJS localStorage.

Exit: reconnect transfers queued events once, without loss or duplicates.

### Phase 6 — Phone report

- Build offline report page opened through app gear action.
- Add today/7-day/30-day summaries and daily detail.
- Add stale-sync and data-loss warnings.
- Add confirmed phone-history clear action.

Exit: phone report works offline from last synced copy.

### Phase 7 — Physical validation

- Test Emery emulator with clock jumps and connection toggles.
- Install on physical Pebble Time 2 through rePebble mobile app/CloudPebble connection.
- Test full reminder → outcome → disconnect → reconnect → report cycle.
- Run multi-day accelerated schedule matrix; then one real next-day reschedule.

Exit: acceptance checklist passes on physical watch and phone.

## 12. Acceptance checklist

- Exactly four independent daily slots.
- Slot times/settings editable on watch and persistent.
- Disabled slot never fires; edited slot uses new time only.
- Reminder launches app while closed and identifies correct slot/time.
- Tomorrow's event schedules before user interaction.
- `Taken`, `Skipped`, and `No response` remain distinct.
- Report labels taken outcomes as self-reported.
- Alert/report work without phone connection.
- Offline events queue and later sync.
- Repeated/retried batches create no duplicates.
- Watch deletes no unsynced event after failed phone write.
- Phone report shows today, 7-day, and 30-day results.
- Phone report displays last sync and stale state.
- Settings snapshot matches watch but is read-only on phone.
- Timezone changes do not regroup historical local days.
- Scheduling, storage, queue overflow, and sync failures remain visible.
- No medication data sent to network/cloud.

## 13. Explicitly out of scope for v1

- phone editing of reminder settings
- standalone iOS/Android companion app
- continuous/background sync guarantee
- cloud backup, account, multi-phone sync
- clinician/caregiver sharing, CSV/PDF export
- Apple Health, Health Connect, or medical-system integration
- pill names, dosage, photos, inventory, refill tracking
- snooze or repeated nagging
- day-of-week/weekend schedules
- original Pebble models, Pebble 2 Duo, Pebble Round 2

Possible v2 order: custom pill labels → snooze → day-of-week schedules → phone editing with explicit conflict rules → export.

## 14. Current local state

- Repo contains plan only; no app scaffold.
- Repo uses Jujutsu (`.jj`) and Git.
- `pebble` CLI is not currently installed/on `PATH`.
- No build or server command run during planning.

## 15. Sources checked

- [rePebble hardware table](https://developer.repebble.com/guides/tools-and-resources/hardware-information/)
- [Alloy overview and Emery support](https://developer.repebble.com/guides/alloy/)
- [Alloy TypeScript example](https://github.com/Moddable-OpenSource/pebble-examples/tree/main/hellotypescript)
- [Alloy Piu UI](https://developer.repebble.com/guides/alloy/piu-guide/)
- [Alloy wakeups](https://developer.repebble.com/guides/alloy/wakeups/)
- [Alloy storage](https://developer.repebble.com/guides/alloy/storage/)
- [Alloy AppMessages](https://developer.repebble.com/guides/alloy/app-messages/)
- [Alloy vibration](https://developer.repebble.com/guides/alloy/vibration/)
- [PebbleKit JS](https://developer.repebble.com/guides/communication/using-pebblekit-js/)
- [Pebble app configuration and Clay](https://developer.repebble.com/guides/user-interfaces/app-configuration/)
- [Pebble Datalogging limitation](https://developer.repebble.com/guides/communication/datalogging/)
