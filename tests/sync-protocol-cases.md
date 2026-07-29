# Phone sync validation cases

- Launch connected. Confirm phone request → SETTINGS → one event message per retained event → DONE.
- Create four outcomes offline. Reconnect. Confirm all appear once on phone.
- Disconnect during transfer. Reconnect. Confirm full resend creates no duplicate.
- Make phone storage write fail. Confirm watch still retains its history.
- Re-send old batch. Confirm upsert by `installId + sequence`.
- Clear phone report. Confirm events clear; retained watch events from before
  the clear stay excluded after later syncs.
- Fill watch beyond 128 events. Confirm phone report shows dropped count.
- Open report disconnected. Confirm last cached report and stale timestamp.
- Verify report loads without network requests or external resources.
- Verify phone report contains no pill data in console logs.
- Open phone settings. Confirm latest watch snapshot populates all reminders, position, size, and colours.
- Save phone settings. Confirm watch applies accepted values, then sends a fresh
  settings snapshot, retained events, and sync-complete message.
