# Using the app

## Configure reminders

1. Hold Down from the word-time display to open **Configuration**.
2. Choose **Reminders** with Up/Down, then hold Down.
3. Choose a reminder or **+ Add reminder**, then hold Down.
4. Use Up/Down to choose Enabled, Hour, Minute, or Save.
5. Hold Down to enter a field. Change it with Up/Down, then hold Down to confirm.
6. On Save, hold Down to persist and reschedule.
7. Hold Up to cancel editing or move back through configuration screens.

Select and Back are intentionally unused for app navigation.

## Configure and switch timezones

1. Open Number Watch settings in the rePebble phone app.
2. Configure **Home** with a named IANA timezone and label.
3. Use **+ Add timezone** to enable up to three more named timezones.
4. Choose a label and one of 20 vivid colour schemes for each, then save.
5. On the watchface, press Up for the previous checked timezone or Down for the
   next. Each change briefly shows that timezone's label.

Number Watch starts on Home. Only checked timezones participate in switching.
You can also hold Down, choose **Timezones**, then hold Down on a label to show
it and return to the watchface.

The phone resolves daylight-saving rules and sends the current offset plus the
next transition when its bridge connects, settings are saved, or a report sync
occurs. The watch stores that transition, so one upcoming daylight-saving
change works while disconnected. Later phone contact refreshes the next one.
Reminder schedules follow the named Home calendar timezone.

The phone settings/report page has its own **Auto**, **Light**, and **Dark**
appearance setting. Auto follows the phone. Light uses black on white; Dark
uses white on black. This does not change the watch colour scheme.

## Acknowledge a reminder

When a reminder is due, the watch vibrates and displays **TAKE PILL 1**,
**TAKE PILL 2**, and so on. Respond while that alert remains visible:

```text
right buttons

UP
Acknowledge → Taken

DOWN
Dismiss → Not taken
```

- Press upper-right **Up** to acknowledge and record **Taken**.
- Press lower-right **Down** to dismiss without recording Taken.
- Select and Back are not app actions on this screen.

The buttons work only while the reminder alert is visible. The alert vibrates
every 30 seconds for five minutes. If it expires without Up, it
remains **Not taken**.

After Up, Number Watch returns to its word-time display. The watch saves Taken
before returning.

## See the acknowledgement on the phone

1. Keep the watch connected to the phone.
2. Open the app's gear or **Settings** action in rePebble.
3. Check that **Last synced** changes to the current time.
4. Expand today's row under **Taken list**.
5. Confirm the reminder says **Taken**.

Every Home day has one row per expected reminder slot. For example, if two
reminders were expected, the list contains exactly two pills marked Taken or
Not taken. Duplicate watch events cannot create extra pills.

For a Taken pill, choose any checked timezone in **Taken time**. The underlying
answer is stored as one UTC instant; this selector only changes its calendar
date/time rendering. The phone keeps the Home timezone and Home day first used
for that event, so travel and 23/25-hour daylight-saving days do not require
fixed 24-hour arithmetic. Save with **Save taken timezones**.

The phone does not create the acknowledgement. It receives the saved outcome
from the watch during synchronisation.

## Export or clear report history

1. Under **Report history**, choose to keep the last **7 days**, **30 days**, or
   **Nothing — clear all**.
2. Use **Save records to file** to export the records that the selected clear
   operation will remove as JSON.
3. Use **Clear older records** and confirm.

Clearing changes only phone-local history. The selected cutoff also prevents
older retained watch events from reappearing after synchronisation. Records
newer than the cutoff remain available.

## If the phone still shows Not taken

Check these in order:

1. Confirm Up was pressed while **TAKE PILL** was still on screen.
2. Confirm the watch returned to the word-time display.
3. Reopen phone settings and check that **Last synced** advances.
4. Confirm the watch is connected in rePebble.
5. Do not clear report history while diagnosing. It deletes the selected
   phone-local records and excludes them from later watch resyncs.

If the watch did not return to the word-time display after Up, the
response was not completed. If it returned but the phone did not update after
synchronisation, the failure is in watch-to-phone synchronisation.
