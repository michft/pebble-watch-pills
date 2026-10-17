/*
 * Rules shared by the phone bridge and the generated settings page.
 *
 * Every function in PAGE_FUNCTIONS is injected into the page with
 * Function#toString, so those functions must stay ES5, self-contained, and
 * may only reference each other and the constants emitted by pageSource().
 */
var SLOT_COUNT = 4;
var TIMEZONE_COUNT = 4;
var MINIMUM_SLOT_GAP_MINUTES = 2;
var LABEL_PATTERN = /^[A-Z0-9 ]{1,8}$/;
var DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Checks a watch timezone label against the native label rules.
 * @param {*} label - The candidate label.
 * @return {boolean} `true` for 1-8 upper-case letters, digits, or spaces.
 */
function labelValid(label) {
  return typeof label === "string" && LABEL_PATTERN.test(label);
}

/**
 * Detects enabled reminder slots that are closer than the minimum gap.
 * Gaps wrap around midnight, so 23:59 and 00:00 are one minute apart.
 * @param {Array<Object>} slots - Slots with `hour`, `minute`, and `enabled`.
 * @return {boolean} `true` when any two enabled slots are too close.
 */
function enabledSlotsTooClose(slots) {
  for (var left = 0; left < slots.length; left += 1) {
    if (!slots[left].enabled) continue;
    for (var right = left + 1; right < slots.length; right += 1) {
      if (!slots[right].enabled) continue;
      var gap = Math.abs(
        (slots[left].hour * 60 + slots[left].minute)
        - (slots[right].hour * 60 + slots[right].minute)
      );
      if (Math.min(gap, 1440 - gap) < MINIMUM_SLOT_GAP_MINUTES) return true;
    }
  }
  return false;
}

/**
 * Derives a compact watch label from an IANA timezone name.
 * POSIX-style Etc/GMT names have inverted signs (Etc/GMT+5 is UTC-5), and
 * labels cannot contain "+" or "-", so they become e.g. "UTC 5W" or "UTC 10E".
 * @param {string} timeZone - The timezone name.
 * @return {string} A label that satisfies labelValid().
 */
function labelForTimeZone(timeZone) {
  var name = String(timeZone || "UTC");
  var fixed = /^(?:Etc\/)?(?:GMT|UTC|UCT|Greenwich|Universal|Zulu)(?:([+-])0*(\d{1,2}))?0?$/i.exec(name);
  if (fixed) {
    var hours = fixed[2] ? parseInt(fixed[2], 10) : 0;
    if (!hours) return "UTC";
    return "UTC " + hours + (fixed[1] === "+" ? "W" : "E");
  }
  var segments = name.split("/");
  var label = segments[segments.length - 1]
    .replace(/_/g, " ")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .slice(0, 8)
    .replace(/^ +| +$/g, "");
  return label || "ZONE";
}

/**
 * Resolves a timezone name to the engine's canonical spelling.
 * @param {string} timeZone - A user-entered or stored timezone name.
 * @return {?string} The canonical name (e.g. "us/eastern" becomes
 *   "America/New_York" on most engines), or null when it cannot be resolved.
 */
function canonicalTimeZoneName(timeZone) {
  if (typeof timeZone !== "string" || !timeZone) return null;
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return null;
  try {
    var resolved = new Intl.DateTimeFormat("en-US", { timeZone: timeZone })
      .resolvedOptions().timeZone;
    return typeof resolved === "string" && resolved ? resolved : timeZone;
  } catch (error) {
    return null;
  }
}

/**
 * Converts a `YYYY-MM-DD` day key into a day count since the Unix epoch.
 * @param {string} dayKey - The calendar day key.
 * @return {?number} The day ordinal, or null for malformed keys.
 */
function dayOrdinal(dayKey) {
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey));
  if (!match) return null;
  return Math.floor(
    Date.UTC(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10))
    / (24 * 60 * 60 * 1000)
  );
}

/**
 * Checks whether a Home day lies inside the latest `dayCount` Home days.
 * "Last 7 days" therefore means today plus the six previous Home days.
 * @param {string} dayKey - The event's Home day key.
 * @param {string} todayKey - Today's Home day key.
 * @param {number} dayCount - The number of Home days in the window.
 * @return {boolean} `true` when the day is inside the window.
 */
function withinHomeDays(dayKey, todayKey, dayCount) {
  var day = dayOrdinal(dayKey);
  var today = dayOrdinal(todayKey);
  return day !== null && today !== null && day <= today && day > today - dayCount;
}

/**
 * Checks whether a Home day is older than the latest `dayCount` Home days.
 * This is the exact complement of withinHomeDays for past days; future and
 * malformed days are never treated as old.
 * @param {string} dayKey - The event's Home day key.
 * @param {string} todayKey - Today's Home day key.
 * @param {number} dayCount - The number of Home days kept.
 * @return {boolean} `true` when the day would be cleared.
 */
function olderThanHomeDays(dayKey, todayKey, dayCount) {
  var day = dayOrdinal(dayKey);
  var today = dayOrdinal(todayKey);
  return day !== null && today !== null && day <= today - dayCount;
}

/**
 * Converts a day ordinal back into a `YYYY-MM-DD` key.
 * @param {number} ordinal - Days since the Unix epoch.
 * @return {string} The day key.
 */
function dayKeyFromOrdinal(ordinal) {
  return new Date(ordinal * DAY_MS).toISOString().slice(0, 10);
}

var PAGE_FUNCTIONS = [
  labelValid,
  enabledSlotsTooClose,
  labelForTimeZone,
  canonicalTimeZoneName,
  dayOrdinal,
  withinHomeDays,
  olderThanHomeDays,
];

/**
 * Builds the script source that defines the shared constants and rules.
 * @return {string} ES5 source for inclusion in the generated page.
 */
function pageSource() {
  return "var SLOT_COUNT=" + SLOT_COUNT
    + ";var TIMEZONE_COUNT=" + TIMEZONE_COUNT
    + ";var MINIMUM_SLOT_GAP_MINUTES=" + MINIMUM_SLOT_GAP_MINUTES
    + ";var LABEL_PATTERN=" + LABEL_PATTERN.toString() + ";\n"
    + PAGE_FUNCTIONS.map(function (fn) { return fn.toString(); }).join("\n");
}

exports.SLOT_COUNT = SLOT_COUNT;
exports.TIMEZONE_COUNT = TIMEZONE_COUNT;
exports.MINIMUM_SLOT_GAP_MINUTES = MINIMUM_SLOT_GAP_MINUTES;
exports.LABEL_PATTERN = LABEL_PATTERN;
exports.labelValid = labelValid;
exports.enabledSlotsTooClose = enabledSlotsTooClose;
exports.labelForTimeZone = labelForTimeZone;
exports.canonicalTimeZoneName = canonicalTimeZoneName;
exports.dayOrdinal = dayOrdinal;
exports.withinHomeDays = withinHomeDays;
exports.olderThanHomeDays = olderThanHomeDays;
exports.dayKeyFromOrdinal = dayKeyFromOrdinal;
exports.pageSource = pageSource;
