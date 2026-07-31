# Number Watch with Pill Reminders — Implemented Plan

Status: implemented; current feature release is 0.2.4

Target: Pebble Time 2 / rePebble `emery`

Date: 2026-07-22

## Product

Watchapp displays local time or a fixed UTC offset as named numbers. Existing
four-slot pill reminder, outcome history, persistence, wakeups, and phone report
remain intact.
Reminder alert interrupts watchface. Pebble OS reserves buttons for true
watchfaces, so prior button outcome flow cannot be used unchanged.

## Display rules

- Follow watch 12/24-hour preference.
- Allow local time or a fixed UTC offset for display; reminders stay local.
- Update each minute.
- Place every space-separated word on new line.
- When phrase has at most three words, split long `-teen` words at syllable.
- Required examples:
  - `08:17` → `eight / seven / -teen`
  - `12:27` → `twelve / twenty / seven`
  - `01:06` → `one / o' / six`
- Phone config controls left/centre/right, top/middle/bottom, three font sizes,
  text colour, and background colour.

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
  -> validated display + four reminder slots
  -> persisted watch state + wakeup reschedule

minute tick -> time_words.c -> watchface TextLayer
wakeup      -> reminder alert -> Up acknowledgement records Taken
```

`time_words.c` remains Pebble-independent for host C tests. Reminder persistence
format stays version 2; display config uses separate persistence key.

## Validation

- `pnpm test`
- `pnpm build`
- `git diff --check`
- Emery screenshots saved under `docs/screenshots/`
- Live Emery wakeup captured as `pill-reminder-alert.png`
- Button-capable watchapp keeps Back conventional and uses Up to acknowledge alerts.
