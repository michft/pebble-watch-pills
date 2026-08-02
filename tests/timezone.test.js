const assert = require("node:assert/strict");
const test = require("node:test");
const {
  dateKeyAt,
  labelForTimeZone,
  offsetMinutesAt,
  supportedTimeZones,
  timeLabelAt,
  timezoneSnapshot,
} = require("../src/pkjs/timezone.js");

test("resolves named timezone offsets", () => {
  const january = Date.UTC(2026, 0, 15, 12);

  assert.equal(offsetMinutesAt("UTC", january), 0);
  assert.equal(offsetMinutesAt("Australia/Sydney", january), 660);
  assert.equal(offsetMinutesAt("America/New_York", january), -300);
  assert.equal(offsetMinutesAt("Not/A_Zone", january), null);
});

test("finds next named timezone daylight-saving transition", () => {
  const january = Date.UTC(2026, 0, 15, 12);
  const snapshot = timezoneSnapshot("Australia/Sydney", january);

  assert.equal(snapshot.offsetMinutes, 660);
  assert.ok(snapshot.transitionAt > january / 1000);
  assert.equal(snapshot.transitionOffsetMinutes, 600);
});

test("provides compact labels and selectable timezone names", () => {
  assert.equal(labelForTimeZone("Europe/London"), "LONDON");
  assert.equal(labelForTimeZone("America/Los_Angeles"), "LOS ANGE");
  assert.ok(supportedTimeZones().includes("Australia/Sydney"));
});

test("renders one instant in travel and home zones without assuming 24-hour days", () => {
  const instant = Date.UTC(2026, 7, 2, 14, 0);

  assert.equal(timeLabelAt("Europe/Madrid", instant), "16:00");
  assert.equal(dateKeyAt("Europe/Madrid", instant), "2026-08-02");
  assert.equal(timeLabelAt("Australia/Sydney", instant), "00:00");
  assert.equal(dateKeyAt("Australia/Sydney", instant), "2026-08-03");
});
