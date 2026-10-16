const assert = require("node:assert/strict");
const test = require("node:test");
const {
  canonicalTimeZoneName,
  dateKeyAt,
  labelForTimeZone,
  normaliseZones,
  offsetMinutesAt,
  supportedTimeZones,
  timeLabelAt,
  timezoneSnapshot,
  zonedParts,
} = require("../src/pkjs/timezone.js");

test("resolves named timezone offsets", () => {
  const january = Date.UTC(2026, 0, 15, 12);

  assert.equal(offsetMinutesAt("UTC", january), 0);
  assert.equal(offsetMinutesAt("Australia/Sydney", january), 660);
  assert.equal(offsetMinutesAt("America/New_York", january), -300);
  assert.equal(offsetMinutesAt("Not/A_Zone", january), null);
});

test("finds exact next daylight-saving transitions in both hemispheres", () => {
  const january = Date.UTC(2026, 0, 15, 12);
  // Instants cross-checked with Intl shortOffset: Sydney leaves AEDT at
  // 2026-04-05 03:00 local, New York enters EDT at 2026-03-08 02:00 local.
  for (const [timeZone, offset, transition, nextOffset] of [
    ["Australia/Sydney", 660, "2026-04-04T16:00:00Z", 600],
    ["America/New_York", -300, "2026-03-08T07:00:00Z", -240],
  ]) {
    const snapshot = timezoneSnapshot(timeZone, january);
    assert.deepEqual(snapshot, {
      offsetMinutes: offset,
      transitionAt: Date.parse(transition) / 1000,
      transitionOffsetMinutes: nextOffset,
    }, timeZone);
    assert.equal(offsetMinutesAt(timeZone, Date.parse(transition) - 60_000), offset);
    assert.equal(offsetMinutesAt(timeZone, Date.parse(transition)), nextOffset);
  }
});

test("reports no transition for zones without daylight saving", () => {
  const january = Date.UTC(2026, 0, 15, 12);
  assert.deepEqual(timezoneSnapshot("UTC", january),
    { offsetMinutes: 0, transitionAt: 0, transitionOffsetMinutes: 0 });
  assert.deepEqual(timezoneSnapshot("Asia/Kolkata", january),
    { offsetMinutes: 330, transitionAt: 0, transitionOffsetMinutes: 330 });
});

function withFormatter(format, callback) {
  const originalDateTimeFormat = Intl.DateTimeFormat;
  const requested = [];
  Intl.DateTimeFormat = function (locale, options) {
    requested.push(options);
    return { formatToParts: (date) => format(date, options) };
  };
  try {
    return callback(requested);
  } finally {
    Intl.DateTimeFormat = originalDateTimeFormat;
  }
}

function parts(year, month, day, hour, minute, extra = []) {
  const two = (value) => String(value).padStart(2, "0");
  return [
    { type: "month", value: two(month) }, { type: "literal", value: "/" },
    { type: "day", value: two(day) }, { type: "literal", value: "/" },
    { type: "year", value: String(year) }, { type: "literal", value: ", " },
    { type: "hour", value: two(hour) }, { type: "literal", value: ":" },
    { type: "minute", value: two(minute) }, { type: "literal", value: ":" },
    { type: "second", value: "00" }, ...extra,
  ];
}

test("requests 24-hour parts from engines that ignore hourCycle", () => {
  const instant = Date.UTC(2026, 0, 15, 15, 0);
  // Behaves like an engine without hourCycle support: 12-hour unless hour12 is false.
  withFormatter((date, options) => (options.hour12 === false
    ? parts(2026, 1, 15, 15, 0)
    : parts(2026, 1, 15, 3, 0)), (requested) => {
    assert.equal(offsetMinutesAt("Test/Hour12Engine", instant), 0);
    assert.equal(timeLabelAt("Test/Hour12Engine", instant), "15:00");
    assert.equal(requested[0].hour12, false);
  });
});

test("normalises midnight reported as 24 and stray 12-hour day periods", () => {
  const midnight = Date.UTC(2026, 0, 15, 0, 0);
  withFormatter(() => parts(2026, 1, 15, 24, 0), () => {
    assert.equal(offsetMinutesAt("Test/Hour24Engine", midnight), 0);
    assert.equal(timeLabelAt("Test/Hour24Engine", midnight), "00:00");
    assert.equal(dateKeyAt("Test/Hour24Engine", midnight), "2026-01-15");
  });
  const afternoon = Date.UTC(2026, 0, 15, 15, 0);
  withFormatter(() => parts(2026, 1, 15, 3, 0, [{ type: "dayPeriod", value: "PM" }]), () => {
    assert.equal(offsetMinutesAt("Test/DayPeriodEngine", afternoon), 0);
  });
  withFormatter(() => parts(2026, 1, 15, 12, 0, [{ type: "dayPeriod", value: "AM" }]), () => {
    assert.equal(offsetMinutesAt("Test/MidnightAmEngine", midnight), 0);
  });
});

test("provides compact labels and selectable timezone names", () => {
  assert.equal(labelForTimeZone("Europe/London"), "LONDON");
  assert.equal(labelForTimeZone("America/Los_Angeles"), "LOS ANGE");
  assert.equal(labelForTimeZone("America/Port_of_Spain"), "PORT OF");
  // POSIX Etc/GMT signs are inverted: Etc/GMT+5 is UTC-5 (west).
  assert.equal(labelForTimeZone("Etc/GMT+5"), "UTC 5W");
  assert.equal(labelForTimeZone("Etc/GMT-10"), "UTC 10E");
  assert.equal(labelForTimeZone("Etc/GMT-14"), "UTC 14E");
  assert.equal(labelForTimeZone("Etc/GMT"), "UTC");
  assert.equal(labelForTimeZone("Etc/UTC"), "UTC");
  assert.equal(offsetMinutesAt("Etc/GMT+5", Date.UTC(2026, 0, 1)), -300);
  assert.ok(supportedTimeZones().includes("Australia/Sydney"));
});

test("canonicalises timezone aliases and rejects unknown names", () => {
  const resolve = (name) => new Intl.DateTimeFormat("en-US", { timeZone: name }).resolvedOptions().timeZone;
  assert.equal(canonicalTimeZoneName("us/eastern"), resolve("US/Eastern"));
  assert.equal(canonicalTimeZoneName("australia/sydney"), "Australia/Sydney");
  assert.equal(canonicalTimeZoneName("Not/A_Zone"), null);
  assert.equal(canonicalTimeZoneName(""), null);
});

test("renders one instant in travel and home zones without assuming 24-hour days", () => {
  const instant = Date.UTC(2026, 7, 2, 14, 0);

  assert.equal(timeLabelAt("Europe/Madrid", instant), "16:00");
  assert.equal(dateKeyAt("Europe/Madrid", instant), "2026-08-02");
  assert.equal(timeLabelAt("Australia/Sydney", instant), "00:00");
  assert.equal(dateKeyAt("Australia/Sydney", instant), "2026-08-03");
});

test("rejects malformed numeric timezone parts", () => {
  const originalDateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function () {
    return {
      formatToParts() {
        return [
          { type: "year", value: "invalid" },
          { type: "month", value: "08" },
          { type: "day", value: "03" },
          { type: "hour", value: "16" },
          { type: "minute", value: "00" },
          { type: "second", value: "00" },
        ];
      },
    };
  };
  try {
    assert.equal(zonedParts("Test/Malformed", 0), null);
  } finally {
    Intl.DateTimeFormat = originalDateTimeFormat;
  }
});


test("migrates the shared mode while preserving explicit per-timezone choices", () => {
  for (const useDigits of [false, true]) {
    const zones = Array.from({ length: 4 }, (_, id) => ({ id, enabled: id < 3 }));
    assert.deepEqual(normaliseZones({ display: { useDigits }, zones })
      .map((zone) => zone.useDigits), Array(4).fill(useDigits));
    assert.deepEqual(normaliseZones({ display: { useDigits } })
      .map((zone) => zone.useDigits), Array(4).fill(useDigits));
    zones[0].useDigits = false;
    zones[1].useDigits = true;
    zones[2].useDigits = false;
    assert.deepEqual(normaliseZones({ display: { useDigits }, zones })
      .map((zone) => zone.useDigits), [false, true, false, useDigits]);
  }
});
