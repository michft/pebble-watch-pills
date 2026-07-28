# Using the app

## Identify the installed version

The phone configuration heading shows which build is installed:

- **Pill Reminder** with **Read-only. Edit times on watch.** is version 0.1.2.
- **Number Watch** with editable reminder and display settings is version 0.2.0.
- **Number Watch** version 0.2.1 restores watch button navigation.

The screenshots showing **Pill Reminder** are from version 0.1.2. In that
version, the phone page displays and stores the report. It cannot record a
reminder acknowledgement.

## Configure reminders in Number Watch 0.2.1

1. Press Select from the word-time display.
2. Use Up/Down to choose a reminder or **+ Add reminder**.
3. Press Select to edit.
4. Use Up/Down to choose Enabled, Hour, Minute, or Save.
5. Press Select to change the selected value or save.
6. Press Back to cancel or return to the word-time display.

## Acknowledge a reminder

When a reminder is due, the watch vibrates and displays **TAKE PILL 1**,
**TAKE PILL 2**, and so on. Respond while that alert remains visible:

```text
left button          right buttons

BACK                  UP
No response
                      SELECT
                      Taken

                      DOWN
                      Skipped
```

- Press the middle-right **Select** button to record **Taken**.
- Press the lower-right **Down** button to record **Skipped**.
- Press the left **Back** button to dismiss it as **No response**.

The buttons work only while the reminder alert is visible. The alert vibrates
every 30 seconds for five minutes. If it expires without Select or Down, it
remains **No response**.

After Select or Down, Number Watch returns to its word-time display. The watch
saves the selected outcome before returning.

## See the acknowledgement on the phone

1. Keep the watch connected to the phone.
2. Open the app's gear or **Settings** action in rePebble.
3. Check that **Last synced** changes to the current time.
4. Expand today's row under **Daily detail**.
5. Confirm the reminder says **Taken** or **Skipped**.

The phone does not create the acknowledgement. It receives the saved outcome
from the watch during synchronisation.

## If the phone still shows No response

Check these in order:

1. Confirm Select or Down was pressed while **TAKE PILL** was still on screen.
2. Confirm the watch returned to the word-time display.
3. Reopen phone settings and check that **Last synced** advances.
4. Confirm the watch is connected in rePebble.
5. Do not press **Clear phone report** while diagnosing. It deletes the phone's
   local copy, although retained watch history can return during a later sync.

If the watch did not return to the word-time display after Select or Down, the
response was not completed. If it returned but the phone did not update after
synchronisation, the failure is in watch-to-phone synchronisation.

## Number Watch 0.2.0 limitation

Number Watch 0.2.0 is packaged as a true watchface. Pebble OS reserves normal
watchface button presses, so its current Select/Down acknowledgement handlers
cannot be relied on. The alert still interrupts the watchface and records
**No response** when unanswered, but a replacement Taken/Skipped input method
must be chosen before public release.

Possible replacements are:

- Taken and Skipped controls on the phone.
- Deliberate watch gestures such as a tap or shake.

Number Watch 0.2.1 resolves this limitation by running as a watchapp, restoring
Select, Down, and Back controls.
