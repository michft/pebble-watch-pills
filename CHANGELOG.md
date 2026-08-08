# Changelog

All published versions are tracked here and as GitHub Releases.

## [0.2.10] - 2026-08-08

- Make up to three serialized phone-to-watch settings delivery attempts, ignore
  stale retry callbacks after a newer save, and keep settings pending until the
  watch confirms their timezone state, labels, and colours.
- Let phone report history retain the last 7 or 30 days, or clear everything,
  while continuing to exclude cleared watch events from later resyncs.
- Export every report record selected for clearing to a local JSON file.

## [0.2.9] - 2026-08-07

- Replace separate watch text/background colour choices with 20 vivid,
  recommended schemes and phone-side previews.
- Add Auto, Light, and Dark appearance modes for the phone settings/report page,
  independent from watch colours.
- Keep scheme colours consistent between phone previews and the Emery watch,
  including Vivid Violet for `#aa00ff`.

## [0.2.8] - 2026-08-02

- Add a named Home timezone plus three optional checked timezones, each with
  its own label and colours.
- Move watch navigation to Up/Down short and long presses so Select and Back do
  not block entry to or exit from configuration screens.
- Show only checked reminders and timezones in phone settings, with Add actions
  at the bottom of both lists.
- Limit each Home calendar day to one Taken/Not taken result per enabled pill
  slot, and preserve UTC answer instants with selectable timezone rendering.
- Handle Home daylight-saving gaps and repeated hours without fixed 24-hour
  scheduling arithmetic.

## [0.2.7] - 2026-08-02

- Update the default Emery app-store screenshot to show `22:23` in the large
  white-on-black word-time layout.

## [0.2.6] - 2026-08-01

- Split only `seventeen` at Large font size, leaving fitting teen words whole
  and avoiding syllable splits at Small and Medium sizes.

## [0.2.5] - 2026-08-01

- Start in phone-synchronised local time and let Down toggle a configured named
  second timezone.
- Give the second timezone its own colours and briefly show the selected zone
  label after each switch.
- Refresh the named-zone offset and next daylight-saving transition from the
  connected phone, with watch-side storage for offline transitions.

## [0.2.4] - 2026-07-31

- Add a phone setting to display local time or a fixed UTC offset from UTC-12:00
  through UTC+14:00 in 15-minute steps.
- Keep reminder schedules in watch-local time and preserve existing display
  preferences when stored settings migrate.

## [0.2.3] - 2026-07-30

- Speak single-digit minutes as `o' one` through `o' nine`, distinguishing
  times such as `20:02` from `22:00`.
- Replace reminder outcome controls with one upper-right Up acknowledgement
  that records Taken.
- Start a full watch-to-phone sync after phone settings reach the watch.
- Upload a centred white-on-black `21:23` Emery screenshot with app-store
  releases.

## [0.2.2] - 2026-07-28

- Keep cleared phone report history excluded from later watch resyncs, and
  clarify that time format follows the watch's 12/24-hour system setting.

## [0.2.1] - 2026-07-28

- Restore Number Watch as a button-capable watchapp with its word-time display
  as the home screen.
- Open the reminder list with Select, then allow reminder editing and alert
  outcomes through the existing watch buttons.
- Keep cleared phone report history excluded from later watch resyncs, and
  clarify that time format follows the watch's 12/24-hour system setting.

## [0.2.0] - 2026-07-22

- Add Number Watch watchface while retaining four-slot pill reminders, wakeups,
  outcome history, persistence, and phone report.
- Render one time word per line and, in short phrases, split long teen words at
  a syllable boundary, including `eight / seven / -teen`.
- Preserve descenders such as final-line `y` by padding watchface text bounds.
- Add phone settings for reminder times, horizontal and vertical alignment,
  three font sizes, text colour, and background colour.
- Make reminder alerts interrupt watchface; final outcome-input UX remains
  unresolved because Pebble OS reserves watchface buttons.

## [0.1.2] - 2026-07-21

- Add watch-mode builds and improve watch text sizing and layout.
- Add the three-row scrolling reminder list and `+ Add reminder` action.
- Repeat reminder vibrations for five minutes and keep the Emery footer on-screen.

## [0.1.1] - 2026-07-21

- Harden watch persistence, reminder outcome tracking, and phone-history clearing.
- Tighten persisted-event validation and local-time scheduler coverage.

## [0.1.0] - 2026-07-21

- Initial four-slot pill reminder with phone-local history and reporting.
