const assert = require("node:assert/strict");
const test = require("node:test");
const { buildReportPage } = require("../src/pkjs/report-page.js");

test("renders outcome wording, stale state, and escaped report values", () => {
  const now = Date.now();
  const html = buildReportPage({
    events: [
      {
        installId: "install",
        sequence: 1,
        slotId: 0,
        scheduledAt: now,
        localDay: new Date(now).toISOString().slice(0, 10),
        timezoneOffset: 0,
        outcome: "taken",
        answeredAt: now,
      },
    ],
    settings: {
      hour12: false,
      display: {
        horizontal: 2,
        vertical: 0,
        fontSize: 1,
        textColor: 5,
        backgroundColor: 1,
      },
      alternate: {
        timeZone: "Europe/London",
        label: "LONDON",
        textColor: 1,
        backgroundColor: 4,
      },
      slots: [
        { id: 0, hour: 8, minute: 0, enabled: true },
        { id: 1, hour: 12, minute: 0, enabled: true },
        { id: 2, hour: 18, minute: 0, enabled: true },
        { id: 3, hour: 22, minute: 0, enabled: false },
      ],
    },
    lastSyncAt: null,
    droppedEvents: 0,
    warning: "<unsafe>",
  });

  assert.match(html, /self-reported taken/i);
  assert.match(html, /Report may be stale/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.doesNotMatch(html, /<unsafe>/);
  assert.match(html, /Save settings/);
  assert.match(html, /then refresh this report/);
  assert.match(html, /Time format follows the watch's 12\/24-hour system setting/);
  assert.match(html, /Second timezone/);
  assert.match(html, /value='Europe\/London' selected>Europe\/London/);
  assert.match(html, /id=alternate-label type=text[^>]+value='LONDON'/);
  assert.match(html, /Down switches between phone-local time/);
  assert.match(html, /Phone refreshes daylight-saving data/);
  assert.match(html, /Text colour/);
  assert.match(html, /Background colour/);
  assert.match(html, /id=slot-0-time type=time required value='08:00'/);
  assert.match(html, /id=horizontal><option value=0>Left<\/option><option value=1>Center<\/option><option value=2 selected>Right/);
  assert.match(html, /Enabled reminders need at least a two minute gap/);
});

test("falls back to UTC second timezone and contrasting colours", () => {
  const html = buildReportPage({
    events: [],
    settings: {
      display: {
        horizontal: 1,
        vertical: 1,
        fontSize: 2,
        textColor: 0,
        backgroundColor: 1,
      },
      slots: [],
    },
    lastSyncAt: null,
    droppedEvents: 0,
    warning: null,
  });

  assert.match(html, /value='UTC' selected>UTC/);
  assert.match(html, /id=alternate-text-color><option value=0>White<\/option><option value=1 selected>Black/);
  assert.match(html, /id=alternate-background-color>[^]*<option value=4 selected>Yellow/);
});
