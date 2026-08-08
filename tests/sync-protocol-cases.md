# Phone sync validation cases

- Launch connected. Confirm phone request → SETTINGS → one event message per retained event → DONE.
- Create four outcomes offline. Reconnect. Confirm all appear once on phone.
- Disconnect during transfer. Reconnect. Confirm full resend creates no duplicate.
- Make phone storage write fail. Confirm watch still retains its history.
- Re-send old batch. Confirm upsert by `installId + sequence`.
- Keep 7 days, then 30 days, in Report history. Confirm older records clear,
  newer records remain, and cleared retained watch events stay excluded after sync.
- Save records selected for clearing. Confirm the JSON file contains only those
  records. Select clear all and confirm phone history becomes empty.
- Fill watch beyond 128 events. Confirm phone report shows dropped count.
- Open report disconnected. Confirm last cached report and stale timestamp.
- Verify report loads without network requests or external resources.
- Verify phone report contains no pill data in console logs.
- Open phone settings. Confirm latest watch snapshot shows only checked
  reminders/timezones, with Add at the bottom of both lists.
- Configure Home plus three optional IANA timezones. Choose different
  recommended colour schemes. Confirm all labels, checked states, offsets,
  next transitions, and scheme colours round-trip.
- Set phone appearance to Auto, Light, and Dark. Confirm Auto follows the phone,
  Light is black on white, Dark is white on black, and watch colours do not change.
- Save phone settings. Confirm watch applies accepted values, then sends a fresh
  settings snapshot, retained events, and sync-complete message.
- Disconnect during a settings save. Confirm delivery retries, the report shows
  a warning if all attempts fail, and old watch colours cannot overwrite the
  pending phone selection before watch confirmation.
- Configure two Home reminders. Confirm each completed Home day contains exactly
  two Taken/Not taken rows even after retained events are resent.
- Record Taken while travelling. Confirm its answer instant can render in each
  checked timezone and keeps the original Home day after later Home changes.
- Cross a 23-hour or 25-hour Home day. Confirm grouping uses Home calendar dates,
  not elapsed 24-hour windows.
