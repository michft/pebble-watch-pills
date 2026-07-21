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
  assert.match(html, /Edit times on watch/);
});
