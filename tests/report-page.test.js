const assert = require("node:assert/strict");
const test = require("node:test");
const { buildReportPage } = require("../src/pkjs/report-page.js");
const { dateKeyAt } = require("../src/pkjs/timezone.js");

function zones() {
  return [
    { id: 0, enabled: true, timeZone: "Australia/Sydney", label: "SYDNEY", textColor: 5, backgroundColor: 1 },
    { id: 1, enabled: true, timeZone: "Europe/London", label: "LONDON", textColor: 1, backgroundColor: 4 },
    { id: 2, enabled: true, timeZone: "Asia/Tokyo", label: "TOKYO", textColor: 1, backgroundColor: 4 },
    { id: 3, enabled: false, timeZone: "America/New_York", label: "NEW YORK", textColor: 1, backgroundColor: 4 },
  ];
}

test("renders checked-only settings and selectable taken timezone", () => {
  const now = Date.now();
  const html = buildReportPage({
    events: [
      {
        installId: "install",
        sequence: 1,
        slotId: 0,
        scheduledAt: now,
        localDay: dateKeyAt("Australia/Sydney", now),
        homeTimeZone: "Australia/Sydney",
        takenTimeZone: "Europe/London",
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
      zones: zones(),
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

  assert.match(html, /Taken means self-reported/);
  assert.match(html, /Report may be stale/);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.doesNotMatch(html, /<unsafe>/);
  assert.match(html, /Save settings/);
  assert.match(html, /Time format follows the watch's 12\/24-hour system setting/);
  assert.match(html, /id=slot-row-3 hidden/);
  assert.match(html, /\+ Add reminder/);
  assert.match(html, /id=zone-row-0><h3>Home — SYDNEY/);
  assert.match(html, /id=zone-row-1><h3>LONDON/);
  assert.match(html, /id=zone-row-2><h3>TOKYO/);
  assert.match(html, /id=zone-row-3 hidden/);
  assert.match(html, /\+ Add timezone/);
  assert.match(html, /id=zone-0-label type=text[^>]+value='SYDNEY'/);
  assert.match(html, /id=zone-1-label type=text[^>]+value='LONDON'/);
  assert.match(html, /id=zone-2-label type=text[^>]+value='TOKYO'/);
  assert.match(html, /Home is default. Up\/Down cycles only displayed timezone labels/);
  assert.match(html, /Phone refreshes daylight-saving data/);
  assert.match(html, /id=slot-0-time type=time required value='08:00'/);
  assert.match(html, /class=taken-zone/);
  assert.match(html, /value='Europe\/London' selected>LONDON —/);
  assert.doesNotMatch(html, /value='America\/New_York' selected/);
  assert.match(html, /Save taken timezones/);
  assert.match(html, /Enabled reminders need at least a two minute gap/);
});

test("deduplicates one expected pill per Home day and slot", () => {
  const now = Date.now();
  const homeDay = dateKeyAt("Australia/Sydney", now);
  const state = {
    events: [
      { installId: "watch", sequence: 1, slotId: 0, scheduledAt: now, localDay: homeDay, homeTimeZone: "Australia/Sydney", outcome: "no_response", answeredAt: null },
      { installId: "watch", sequence: 2, slotId: 0, scheduledAt: now + 1, localDay: homeDay, homeTimeZone: "Australia/Sydney", outcome: "taken", answeredAt: now + 2 },
      { installId: "watch", sequence: 3, slotId: 1, scheduledAt: now + 3, localDay: homeDay, homeTimeZone: "Australia/Sydney", outcome: "no_response", answeredAt: null },
    ],
    settings: {
      zones: zones(),
      slots: [
        { id: 0, hour: 8, minute: 0, enabled: true },
        { id: 1, hour: 20, minute: 0, enabled: true },
        { id: 2, hour: 18, minute: 0, enabled: false },
        { id: 3, hour: 22, minute: 0, enabled: false },
      ],
    },
    lastSyncAt: now,
    droppedEvents: 0,
    warning: null,
  };
  const html = buildReportPage(state);
  const pillOneRows = html.match(/<th scope=row>Pill 1<\/th>/g) || [];
  const pillTwoRows = html.match(/<th scope=row>Pill 2<\/th>/g) || [];

  assert.equal(pillOneRows.length, 1);
  assert.equal(pillTwoRows.length, 1);
  assert.match(html, /1\/2 taken/);
});

test("falls back to Home plus three hidden timezone slots", () => {
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

  assert.match(html, /id=zone-row-1 hidden/);
  assert.match(html, /id=zone-row-2 hidden/);
  assert.match(html, /id=zone-row-3 hidden/);
  assert.match(html, /id=zone-1-time-zone list=timezone-options value='UTC'/);
  assert.match(html, /id=zone-1-text-color><option value=0>White<\/option><option value=1 selected>Black/);
  assert.match(html, /id=zone-1-background-color>[^]*<option value=4 selected>Yellow/);
});
