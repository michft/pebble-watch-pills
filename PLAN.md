# Number Watch with Pill Reminders — Implemented Plan

Status: implemented for release 0.2.8

Target: Pebble Time 2 / rePebble `emery`

Date: 2026-08-01

## Product

Watchapp starts in phone-synchronised local time. Down toggles a configured
named second timezone. Existing four-slot pill reminder, outcome history,
persistence, wakeups, and phone report remain intact.
Reminder alert interrupts watchface. Pebble OS reserves buttons for true
watchfaces, so prior button outcome flow cannot be used unchanged.

## Current workflow expansion

- Default screen remains the watchface.
- Home plus three optional named timezones replace the single alternate zone.
- Up/Down cycles checked timezone labels; long Down enters configuration and
  long Up exits. Select and Back are not used for app navigation.
- Phone lists only checked reminders/timezones and offers Add at list bottoms.
- Up to four Home-calendar reminder slots produce at most one Taken/Not taken
  row per Home day and slot.
- Event instants remain UTC. Phone snapshots Home timezone/day and lets Taken
  time render in any checked IANA timezone, without fixed 24-hour arithmetic.

## Display rules

- Follow watch 12/24-hour preference.
- Default to local time on launch; Down toggles a named second timezone.
- Briefly show `LOCAL` or configured zone label after switching.
- Keep a distinct configurable colour pair for second-timezone mode.
- Resolve named-zone offset and next daylight-saving transition on phone;
  refresh on connection/save/sync and retain next transition on watch.
- Update each minute.
- Place every space-separated word on new line.
- When phrase has at most three words, split long `-teen` words at syllable.
- Required examples:
  - `08:17` → `eight / seven / -teen`
  - `12:27` → `twelve / twenty / seven`
  - `01:06` → `one / o' / six`
- Phone config controls left/centre/right, top/middle/bottom, three font sizes,
  local colours, named second timezone, switch label, and second-zone colours.

## Reminder rules

- Four phone-editable daily slots; phone is configuration surface.
- Phone sends all slot and display settings in one validated message.
- Watch rejects invalid or closer-than-two-minute reminder combinations.
- Accepted changes persist and reschedule wakeup immediately.
- Alert vibrates for five-minute window.
- Taken and No response state model and phone-local 90-day report retained.
- Upper-right Up acknowledges an active alert and records Taken. Back dismisses
  without changing No response.

## Architecture

```text
phone settings/report
  -> PebbleKit JS AppMessage
  -> named-zone current offset + next DST transition
  -> validated display + four reminder slots
  -> persisted watch state + wakeup reschedule

Down        -> local/second-zone toggle -> label -> word time
minute tick -> time_words.c -> watchface TextLayer
wakeup      -> reminder alert -> Up acknowledgement records Taken
```

`time_words.c` and `display_time.c` remain Pebble-independent for host C tests.
Reminder persistence stays version 2; display config migrates to version 3 in
its separate persistence key.

## Validation

- `pnpm test`
- `pnpm build`
- `git diff --check`
- Emery screenshots saved under `docs/screenshots/`
- Live Emery wakeup captured as `pill-reminder-alert.png`
- Button-capable watchapp keeps Back conventional and uses Up to acknowledge alerts.
