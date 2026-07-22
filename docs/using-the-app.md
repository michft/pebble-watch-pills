# Using the app

## Identify the installed version

The phone configuration heading shows which build is installed:

- **Pill Reminder** with **Read-only. Edit times on watch.** is version 0.1.2.
- **Number Watch** with editable reminder and display settings is version 0.2.0.

The screenshots showing **Pill Reminder** are from version 0.1.2. In that
version, the phone page displays and stores the report. It cannot record a
reminder acknowledgement.

## Acknowledge a reminder in Pill Reminder 0.1.2

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

After Select or Down, the watch returns to the reminder list and briefly shows
**Taken recorded** or **Skipped recorded**. That message confirms the watch
saved the outcome.

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
2. Confirm the watch displayed **Taken recorded** or **Skipped recorded**.
3. Reopen phone settings and check that **Last synced** advances.
4. Confirm the watch is connected in rePebble.
5. Do not press **Clear phone report** while diagnosing. It deletes the phone's
   local copy, although retained watch history can return during a later sync.

If the watch did not show a recorded message, the acknowledgement was not
saved. If it showed the message but the phone did not update, the failure is in
watch-to-phone synchronisation.

## Number Watch 0.2.0 limitation

Number Watch 0.2.0 is packaged as a true watchface. Pebble OS reserves normal
watchface button presses, so its current Select/Down acknowledgement handlers
cannot be relied on. The alert still interrupts the watchface and records
**No response** when unanswered, but a replacement Taken/Skipped input method
must be chosen before public release.

Possible replacements are:

- Taken and Skipped controls on the phone.
- Deliberate watch gestures such as a tap or shake.

