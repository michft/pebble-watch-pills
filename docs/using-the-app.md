# Using the app

## Configure reminders

1. Press Select from the word-time display.
2. Use Up/Down to choose a reminder or **+ Add reminder**.
3. Press Select to edit.
4. Use Up/Down to choose Enabled, Hour, Minute, or Save.
5. Press Select to change the selected value or save.
6. Press Back to cancel or return to the word-time display.

## Switch to a second timezone

1. Open Number Watch settings in the rePebble phone app.
2. Under **Second timezone**, choose a named timezone such as
   **Europe/London**.
3. Choose its switch label and text/background colours, then save.
4. On the normal word-time display, press lower-right **Down** to switch.
5. Press Down again to return to local time.

Number Watch starts in local time whenever the watchapp launches. Local time
uses the watch timezone synchronised by the connected phone. A switch briefly
shows the configured label or **LOCAL**; the selected timezone's colour pair
remains visible afterward.

The phone resolves daylight-saving rules and sends the current offset plus the
next transition when its bridge connects, settings are saved, or a report sync
occurs. The watch stores that transition, so one upcoming daylight-saving
change works while disconnected. Later phone contact refreshes the next one.
This changes only the word-time display; reminders remain in watch-local time.

## Acknowledge a reminder

When a reminder is due, the watch vibrates and displays **TAKE PILL 1**,
**TAKE PILL 2**, and so on. Respond while that alert remains visible:

```text
left button          right buttons

BACK                  UP
Dismiss               Acknowledge → Taken

                      SELECT
                      —

                      DOWN
                      —
```

- Press upper-right **Up** to acknowledge and record **Taken**.
- Press left **Back** to dismiss without changing **No response**.
- Select and Down do nothing on this acknowledgement-only screen.

The buttons work only while the reminder alert is visible. The alert vibrates
every 30 seconds for five minutes. If it expires without Up, it
remains **No response**.

After Up, Number Watch returns to its word-time display. The watch saves Taken
before returning.

## See the acknowledgement on the phone

1. Keep the watch connected to the phone.
2. Open the app's gear or **Settings** action in rePebble.
3. Check that **Last synced** changes to the current time.
4. Expand today's row under **Daily detail**.
5. Confirm the reminder says **Taken**.

The phone does not create the acknowledgement. It receives the saved outcome
from the watch during synchronisation.

## If the phone still shows No response

Check these in order:

1. Confirm Up was pressed while **TAKE PILL** was still on screen.
2. Confirm the watch returned to the word-time display.
3. Reopen phone settings and check that **Last synced** advances.
4. Confirm the watch is connected in rePebble.
5. Do not press **Clear phone report** while diagnosing. It deletes the phone's
   local report and excludes older retained watch events from later syncs.

If the watch did not return to the word-time display after Up, the
response was not completed. If it returned but the phone did not update after
synchronisation, the failure is in watch-to-phone synchronisation.
