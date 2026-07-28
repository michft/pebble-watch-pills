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
  assert.match(html, /Time format follows the watch's 12\/24-hour system setting/);
  assert.match(html, /Text colour/);
  assert.match(html, /Background colour/);
  assert.match(html, /id=slot-0-time type=time required value='08:00'/);
  assert.match(html, /id=horizontal><option value=0>Left<\/option><option value=1>Center<\/option><option value=2 selected>Right/);
  assert.match(html, /Enabled reminders need at least a two minute gap/);
});
