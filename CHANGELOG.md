# Changelog

All published versions are tracked here and as GitHub Releases.

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
