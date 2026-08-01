const assert = require("node:assert/strict");
const test = require("node:test");
const {
  labelForTimeZone,
  offsetMinutesAt,
  supportedTimeZones,
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
