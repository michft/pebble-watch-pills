# Scheduler validation cases

Run on Emery emulator, then physical Pebble Time 2.

- From the word-time display, press Select. Confirm the reminder list opens.
- Select a reminder. Confirm its enabled state, hour, minute, and save options are reachable.
- Enable all defaults. Confirm one OS wakeup exists for earliest enabled slot.
- Set slot 1 two minutes ahead. Exit app. Confirm wake launch and vibration.
- Leave the alert unanswered. Confirm vibration repeats every 30 seconds for five minutes, then stops and records `no_response`.
- On alert, press Select. Confirm self-reported `taken`, then next-day wakeup.
- Repeat; press Down. Confirm `skipped`.
- Repeat; press Back. Confirm `no_response` persists.
- Set two enabled slots to same time or one minute apart. Confirm save blocked.
- Disable the earliest slot. Confirm rolling wakeup moves to next enabled slot.
- Edit any slot. Confirm next earliest occurrence is recalculated.
- Reboot between scheduling and due time. Confirm reminder still fires.
- Move clock past due event. Launch app. Confirm one deduplicated `no_response` event.
- Cross local midnight and DST boundary. Confirm next occurrence keeps local wall time.
- Change phone/watch timezone. Open app once. Confirm rolling schedule reconciles.
- Disable all slots. Confirm no OS wakeup remains.
- With four enabled reminders, confirm only three are visible and Up/Down scrolls to the fourth.
- Disable one reminder. Confirm `+ Add reminder` is reachable after the enabled reminders.
- Disable until fewer than three remain. Confirm `+ Add reminder` stays on the bottom visible row.
- Select `+ Add reminder`, save, and confirm the reminder returns to the scrolling list and is scheduled.
- Save four valid reminder slots from phone settings. Confirm watch persists all four and reschedules earliest wakeup.
- Submit phone slots less than two minutes apart. Confirm watch retains prior valid settings.
- Leave the time display visible until a reminder is due. Confirm alert interrupts it; leave it unanswered, confirm `no_response`, then confirm time display returns.
