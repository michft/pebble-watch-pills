var rules = require("./rules");

var formatterCache = {};
var TIMEZONE_COUNT = rules.TIMEZONE_COUNT;
var labelForTimeZone = rules.labelForTimeZone;

var FALLBACK_TIME_ZONES = [
  "UTC",
  "Africa/Johannesburg",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Adelaide",
  "Australia/Brisbane",
  "Australia/Melbourne",
  "Australia/Perth",
  "Australia/Sydney",
  "Europe/Berlin",
  "Europe/London",
  "Europe/Paris",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

/**
 * Returns a cached 24-hour formatter for a timezone.
 * `hour12: false` is set alongside `hourCycle` because some engines support
 * formatToParts but ignore hourCycle, which would otherwise yield 12-hour parts.
 * @param {string} timeZone - The IANA timezone name.
 * @return {Intl.DateTimeFormat} The formatter.
 */
function formatterFor(timeZone) {
  if (!formatterCache[timeZone]) {
    formatterCache[timeZone] = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    });
  }
  return formatterCache[timeZone];
}

function partValue(parts, type) {
  for (var index = 0; index < parts.length; index += 1) {
    if (parts[index].type === type) return parts[index].value;
  }
  return null;
}

function partNumber(parts, type) {
  var value = partValue(parts, type);
  return value === null ? NaN : parseInt(value, 10);
}

/**
 * Normalises a formatted hour to 0-23.
 * Handles "24" for midnight (h24-style engines) and 12-hour output with a
 * dayPeriod part from engines that ignore both hour12 and hourCycle.
 * @param {Array<Object>} parts - Parts from formatToParts.
 * @return {number} The hour, or NaN when it cannot be read.
 */
function hourFromParts(parts) {
  var hour = partNumber(parts, "hour");
  var dayPeriod = partValue(parts, "dayPeriod");
  if (dayPeriod !== null) {
    var afternoon = /^p/i.test(String(dayPeriod).replace(/[^A-Za-z]/g, ""));
    hour = hour % 12 + (afternoon ? 12 : 0);
  }
  return hour === 24 ? 0 : hour;
}

/**
 * Reads the wall-clock fields of an instant in a timezone.
 * @param {string} timeZone - The IANA timezone name.
 * @param {number} timestampMs - The instant in milliseconds.
 * @return {?Object} Year, month, day, hour (0-23), minute, and second, or null.
 */
function zonedParts(timeZone, timestampMs) {
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return null;
  try {
    var parts = formatterFor(timeZone).formatToParts(new Date(timestampMs));
    var result = {
      year: partNumber(parts, "year"),
      month: partNumber(parts, "month"),
      day: partNumber(parts, "day"),
      hour: hourFromParts(parts),
      minute: partNumber(parts, "minute"),
      second: partNumber(parts, "second"),
    };
    if (Object.keys(result).some(function (key) {
      return !isFinite(result[key]);
    })) return null;
    return result;
  } catch (error) {
    return null;
  }
}

function pad2(value) {
  return value < 10 ? "0" + value : String(value);
}

function dateKeyAt(timeZone, timestampMs) {
  var parts = zonedParts(timeZone, timestampMs);
  if (!parts) return null;
  return parts.year + "-" + pad2(parts.month) + "-" + pad2(parts.day);
}

function timeLabelAt(timeZone, timestampMs) {
  var parts = zonedParts(timeZone, timestampMs);
  if (!parts) return null;
  return pad2(parts.hour) + ":" + pad2(parts.minute);
}

function systemTimeZone() {
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (error) {
    return "UTC";
  }
}

function defaultZoneSettings(index) {
  var homeTimeZone = systemTimeZone();
  var timeZone = index === 0 ? homeTimeZone : "UTC";
  return {
    id: index,
    enabled: index === 0,
    useDigits: false,
    timeZone: timeZone,
    label: labelForTimeZone(timeZone),
    textColor: index === 0 ? 0 : 1,
    backgroundColor: index === 0 ? 1 : 10,
    offsetMinutes: 0,
    transitionAt: 0,
    transitionOffsetMinutes: 0,
  };
}

function normaliseZoneSettings(value, index, legacyUseDigits) {
  var fallback = defaultZoneSettings(index);
  var candidate = value || {};
  return {
    id: index,
    enabled: index === 0 || candidate.enabled === true,
    useDigits: typeof candidate.useDigits === "boolean"
      ? candidate.useDigits
      : legacyUseDigits === true,
    timeZone: typeof candidate.timeZone === "string"
      ? candidate.timeZone
      : fallback.timeZone,
    label: typeof candidate.label === "string"
      ? candidate.label
      : fallback.label,
    textColor: Number.isInteger(candidate.textColor)
      ? candidate.textColor
      : fallback.textColor,
    backgroundColor: Number.isInteger(candidate.backgroundColor)
      ? candidate.backgroundColor
      : fallback.backgroundColor,
    offsetMinutes: Number.isInteger(candidate.offsetMinutes)
      ? candidate.offsetMinutes
      : 0,
    transitionAt: Number.isInteger(candidate.transitionAt)
      ? candidate.transitionAt
      : 0,
    transitionOffsetMinutes: Number.isInteger(candidate.transitionOffsetMinutes)
      ? candidate.transitionOffsetMinutes
      : 0,
  };
}

function normaliseZones(settings) {
  if (
    settings
    && Array.isArray(settings.zones)
    && settings.zones.length === TIMEZONE_COUNT
  ) {
    return settings.zones.map(function (zone, index) {
      return normaliseZoneSettings(zone, index, settings.display && settings.display.useDigits);
    });
  }
  var zones = [];
  for (var index = 0; index < TIMEZONE_COUNT; index += 1) {
    zones.push(defaultZoneSettings(index));
  }
  if (settings && settings.alternate) {
    zones[1] = normaliseZoneSettings(settings.alternate, 1);
    zones[1].enabled = true;
  }
  if (settings && settings.display) {
    zones[0].textColor = Number.isInteger(settings.display.textColor)
      ? settings.display.textColor
      : zones[0].textColor;
    zones[0].backgroundColor = Number.isInteger(settings.display.backgroundColor)
      ? settings.display.backgroundColor
      : zones[0].backgroundColor;
  }
  zones.forEach(function (zone) {
    zone.useDigits = Boolean(settings && settings.display && settings.display.useDigits);
  });
  return zones;
}

/**
 * Calculates a timezone's UTC offset at an instant.
 * @param {string} timeZone - The IANA timezone name.
 * @param {number} timestampMs - The instant in milliseconds.
 * @return {?number} Minutes east of UTC, or null when unresolvable.
 */
function offsetMinutesAt(timeZone, timestampMs) {
  var rounded = Math.floor(timestampMs / 60000) * 60000;
  var parts = zonedParts(timeZone, rounded);
  if (!parts) return null;
  var representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  var offset = Math.round((representedAsUtc - rounded) / 60000);
  return isFinite(offset) ? offset : null;
}

function timezoneSnapshot(timeZone, timestampMs) {
  var start = Math.floor(timestampMs / 60000) * 60000;
  var currentOffset = offsetMinutesAt(timeZone, start);
  if (currentOffset === null) return null;

  var step = 7 * 24 * 60 * 60 * 1000;
  var limit = start + 370 * 24 * 60 * 60 * 1000;
  for (var cursor = start + step; cursor <= limit; cursor += step) {
    var candidateOffset = offsetMinutesAt(timeZone, cursor);
    if (candidateOffset === null) return null;
    if (candidateOffset === currentOffset) continue;

    var low = cursor - step;
    var high = cursor;
    while (high - low > 60000) {
      var middle = Math.floor((low + high) / 120000) * 60000;
      if (offsetMinutesAt(timeZone, middle) === currentOffset) low = middle;
      else high = middle;
    }
    return {
      offsetMinutes: currentOffset,
      transitionAt: Math.floor(high / 1000),
      transitionOffsetMinutes: offsetMinutesAt(timeZone, high),
    };
  }

  return {
    offsetMinutes: currentOffset,
    transitionAt: 0,
    transitionOffsetMinutes: currentOffset,
  };
}

function supportedTimeZones() {
  var zones = FALLBACK_TIME_ZONES.slice();
  if (
    typeof Intl !== "undefined"
    && typeof Intl.supportedValuesOf === "function"
  ) {
    try {
      zones = Intl.supportedValuesOf("timeZone").slice();
      if (zones.indexOf("UTC") === -1) zones.unshift("UTC");
    } catch (error) {
      zones = FALLBACK_TIME_ZONES.slice();
    }
  }
  return zones;
}

exports.canonicalTimeZoneName = rules.canonicalTimeZoneName;
exports.labelForTimeZone = labelForTimeZone;
exports.normaliseZoneSettings = normaliseZoneSettings;
exports.normaliseZones = normaliseZones;
exports.dateKeyAt = dateKeyAt;
exports.offsetMinutesAt = offsetMinutesAt;
exports.supportedTimeZones = supportedTimeZones;
exports.systemTimeZone = systemTimeZone;
exports.timeLabelAt = timeLabelAt;
exports.timezoneSnapshot = timezoneSnapshot;
exports.zonedParts = zonedParts;
exports.TIMEZONE_COUNT = TIMEZONE_COUNT;
