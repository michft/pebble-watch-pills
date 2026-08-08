const assert = require("node:assert/strict");
const test = require("node:test");
const vm = require("node:vm");
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
    appearance: "dark",
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
  assert.match(html, /data-appearance='dark'/);
  assert.match(html, /Phone appearance/);
  assert.match(html, /Light — black on white/);
  assert.match(html, /Dark — white on black/);
  assert.match(html, /id=appearance[^]*<option value=dark selected>/);
  assert.match(html, /id=zone-0-scheme[^]*Current colours<\/option>/);
  assert.match(html, /id=zone-0-scheme-preview/);
  assert.match(html, /updateSchemePreview\(p\)/);
  assert.doesNotMatch(html, /id=zone-0-text-color/);
  assert.doesNotMatch(html, /id=zone-0-background-color/);
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
  assert.match(html, /data-initial='Europe\/London'/);
  assert.match(html, /value='Europe\/London' selected>LONDON —/);
  assert.doesNotMatch(html, /value='America\/New_York' selected/);
  assert.match(html, /Save taken timezones/);
  assert.match(
    html,
    /nodes\[i\]\.value!==nodes\[i\]\.getAttribute\('data-initial'\)/,
  );
  assert.match(html, /Enabled reminders need at least a two minute gap/);
  assert.match(html, /Report history/);
  assert.match(html, /id=history-retention/);
  assert.match(html, /value=7>Last 7 days/);
  assert.match(html, /value=30>Last 30 days/);
  assert.match(html, /Save records to file/);
  assert.match(html, /new Blob\(\[content\]/);
  assert.match(html, /retentionDays:selection\.days/);
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

test("falls back to a UTC day when an event Home zone cannot be resolved", () => {
  const now = Date.now();
  const html = buildReportPage({
    events: [{
      installId: "watch",
      sequence: 4,
      slotId: 0,
      scheduledAt: now,
      localDay: null,
      homeTimeZone: "Not/A_Zone",
      outcome: "no_response",
      answeredAt: null,
    }],
    settings: {
      zones: zones(),
      slots: [
        { id: 0, hour: 8, minute: 0, enabled: true },
        { id: 1, hour: 12, minute: 0, enabled: false },
        { id: 2, hour: 18, minute: 0, enabled: false },
        { id: 3, hour: 22, minute: 0, enabled: false },
      ],
    },
    lastSyncAt: now,
    droppedEvents: 0,
    warning: null,
  });

  assert.match(html, /<th scope=row>Pill 1<\/th>/);
});

test("falls back to Home plus three hidden timezone slots and auto appearance", () => {
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
  assert.match(html, /data-appearance='auto'/);
  assert.match(html, /id=appearance[^]*<option value=auto selected>/);
  assert.match(html, /id=zone-1-scheme[^]*value='1,10'[^>]+selected>Solar/);
  assert.match(html, /prefers-color-scheme:dark/);
});

test("exports only history selected for clearing", () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const html = buildReportPage({
    events: [
      { installId: "watch", sequence: 1, slotId: 0, scheduledAt: now - 8 * day, localDay: "2026-07-31", outcome: "no_response", answeredAt: null },
      { installId: "watch", sequence: 2, slotId: 0, scheduledAt: now - 6 * day, localDay: "2026-08-02", outcome: "taken", answeredAt: now - 6 * day + 1 },
      { installId: "watch", sequence: 3, slotId: 0, scheduledAt: now + day, localDay: "2026-08-09", outcome: "no_response", answeredAt: null },
    ],
    settings: { zones: zones(), slots: [] },
    lastSyncAt: now,
    droppedEvents: 0,
    warning: null,
  });
  const script = html.match(/<script>([\s\S]+)<\/script>/)[1];
  const elements = { "history-retention": { value: "7" } };
  for (let index = 0; index < 4; index += 1) {
    elements[`zone-${index}-scheme`] = {
      selectedIndex: 0,
      options: [{ getAttribute() { return "#000000"; } }],
    };
    elements[`zone-${index}-scheme-preview`] = { style: {} };
  }
  let fileContent = null;
  let clicked = false;
  const link = { click() { clicked = true; } };
  const context = {
    Blob: function Blob(parts) { fileContent = parts.join(""); },
    Date,
    JSON,
    URL: { createObjectURL() { return "blob:history"; }, revokeObjectURL() {} },
    alert(message) { throw new Error(message); },
    document: {
      body: { appendChild() {}, removeChild() {} },
      createElement() { return link; },
      documentElement: { setAttribute() {} },
      getElementById(id) { return elements[id]; },
      querySelectorAll() { return []; },
    },
    encodeURIComponent,
    location: { href: "" },
    parseInt,
    setTimeout() {},
  };

  vm.runInNewContext(script, context);
  context.saveClearedRecords();

  const exported = JSON.parse(fileContent);
  assert.equal(clicked, true);
  assert.equal(link.download.startsWith("number-watch-history-"), true);
  assert.deepEqual(exported.events.map((event) => event.sequence), [1]);
  assert.equal(exported.keptDays, 7);

  elements["history-retention"].value = "all";
  fileContent = null;
  context.saveClearedRecords();

  const allExported = JSON.parse(fileContent);
  assert.deepEqual(allExported.events.map((event) => event.sequence), [1, 2, 3]);
  assert.equal(allExported.keptDays, 0);
});
