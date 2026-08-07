var formatterCache = {};
var TIMEZONE_COUNT = 4;

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
      hourCycle: "h23",
    });
  }
  return formatterCache[timeZone];
}

function partNumber(parts, type) {
  for (var index = 0; index < parts.length; index += 1) {
    if (parts[index].type === type) return parseInt(parts[index].value, 10);
  }
  return NaN;
}

function zonedParts(timeZone, timestampMs) {
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return null;
  try {
    var parts = formatterFor(timeZone).formatToParts(new Date(timestampMs));
    var result = {
      year: partNumber(parts, "year"),
      month: partNumber(parts, "month"),
      day: partNumber(parts, "day"),
      hour: partNumber(parts, "hour"),
      minute: partNumber(parts, "minute"),
      second: partNumber(parts, "second"),
    };
    if (Object.keys(result).some(function (key) {
      return !Number.isFinite(result[key]);
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
    timeZone: timeZone,
    label: labelForTimeZone(timeZone),
    textColor: index === 0 ? 0 : 1,
    backgroundColor: index === 0 ? 1 : 10,
    offsetMinutes: 0,
    transitionAt: 0,
    transitionOffsetMinutes: 0,
  };
}

function normaliseZoneSettings(value, index) {
  var fallback = defaultZoneSettings(index);
  var candidate = value || {};
  return {
    id: index,
    enabled: index === 0 || candidate.enabled === true,
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
      return normaliseZoneSettings(zone, index);
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
  return zones;
}

function offsetMinutesAt(timeZone, timestampMs) {
  if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return null;
  try {
    var rounded = Math.floor(timestampMs / 60000) * 60000;
    var parts = formatterFor(timeZone).formatToParts(new Date(rounded));
    var representedAsUtc = Date.UTC(
      partNumber(parts, "year"),
      partNumber(parts, "month") - 1,
      partNumber(parts, "day"),
      partNumber(parts, "hour"),
      partNumber(parts, "minute"),
      partNumber(parts, "second")
    );
    var offset = Math.round((representedAsUtc - rounded) / 60000);
    return Number.isFinite(offset) ? offset : null;
  } catch (error) {
    return null;
  }
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

function labelForTimeZone(timeZone) {
  var segments = String(timeZone || "UTC").split("/");
  return segments[segments.length - 1]
    .replace(/_/g, " ")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .slice(0, 8);
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
