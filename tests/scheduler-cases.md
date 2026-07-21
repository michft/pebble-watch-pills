# Scheduler validation cases

Run on Emery emulator, then physical Pebble Time 2.

- Enable all defaults. Confirm one OS wakeup exists for earliest enabled slot.
- Set slot 1 two minutes ahead. Exit app. Confirm wake launch and vibration.
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
