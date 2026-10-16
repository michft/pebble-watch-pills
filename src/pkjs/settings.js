/*
 * Pure watch-settings rules: validation, AppMessage construction, and
 * timezone fingerprints shared with the native watch code.
 */
var rules = require("./rules");
var timezone = require("./timezone");
var colorSchemes = require("./color-schemes");

var SLOT_COUNT = rules.SLOT_COUNT;
var TIMEZONE_COUNT = rules.TIMEZONE_COUNT;
var APPEARANCES = ["auto", "light", "dark"];
var MIN_OFFSET_MINUTES = -12 * 60;
var MAX_OFFSET_MINUTES = 14 * 60;
var TIMEZONE_RETRY_DELAY_MS = 60 * 1000;
var MAX_ZONE_REFRESH_DELAY_MS = 20 * 24 * 60 * 60 * 1000;

var MessageType = {
  EVENT_BATCH: 3,
  SETTINGS_SNAPSHOT: 5,
  SYNC_DONE: 6,
  REQUEST_SYNC: 7,
  SETTINGS_UPDATE: 8,
  TIMEZONE_UPDATE: 9,
};

function integerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

/**
 * Validates display settings shared by phone saves and watch snapshots.
 * @param {*} display - The candidate display settings.
 * @return {boolean} `true` when every field is in range.
 */
function displayValid(display) {
  return Boolean(
    display
    && typeof display === "object"
    && integerInRange(display.horizontal, 0, 2)
    && integerInRange(display.vertical, 0, 2)
    && integerInRange(display.fontSize, 0, 2)
    && (display.useDigits === undefined || typeof display.useDigits === "boolean")
    && colorSchemes.colorIdValid(display.textColor)
    && colorSchemes.colorIdValid(display.backgroundColor)
  );
}

/**
 * Validates the four reminder slots, including the minimum enabled gap.
 * @param {*} slots - The candidate slots.
 * @return {boolean} `true` when the slots can be stored and rendered safely.
 */
function slotsValid(slots) {
  if (!Array.isArray(slots) || slots.length !== SLOT_COUNT) return false;
  for (var index = 0; index < slots.length; index += 1) {
    var slot = slots[index];
    if (
      !slot
      || slot.id !== index
      || !integerInRange(slot.hour, 0, 23)
      || !integerInRange(slot.minute, 0, 59)
      || typeof slot.enabled !== "boolean"
    ) return false;
  }
  return !rules.enabledSlotsTooClose(slots);
}

function zoneShapeValid(zone, index) {
  return Boolean(
    zone
    && zone.id === index
    && typeof zone.enabled === "boolean"
    && (zone.useDigits === undefined || typeof zone.useDigits === "boolean")
    && !(index === 0 && !zone.enabled)
    && typeof zone.timeZone === "string"
    && zone.timeZone.length >= 1
    && zone.timeZone.length <= 64
    && rules.labelValid(zone.label)
    && colorSchemes.colorIdValid(zone.textColor)
    && colorSchemes.colorIdValid(zone.backgroundColor)
  );
}

/**
 * Validates a settings response from the phone page.
 * Only enabled zones must resolve: disabled zones are sent to the watch as UTC.
 * @param {*} response - The parsed page response.
 * @return {{valid: boolean, warning: ?string}} The result and any user-facing warning.
 */
function validateSettingsResponse(response) {
  var invalid = { valid: false, warning: null };
  if (
    !response
    || !displayValid(response.display)
    || APPEARANCES.indexOf(response.appearance) === -1
    || !Array.isArray(response.zones)
    || response.zones.length !== TIMEZONE_COUNT
    || !slotsValid(response.slots)
  ) return invalid;
  for (var index = 0; index < response.zones.length; index += 1) {
    var zone = response.zones[index];
    if (!zoneShapeValid(zone, index)) return invalid;
    if (zone.enabled && timezone.offsetMinutesAt(zone.timeZone, Date.now()) === null) {
      return {
        valid: false,
        warning: "Timezone " + zone.timeZone + " was not saved because it could not be resolved.",
      };
    }
  }
  return { valid: true, warning: null };
}

function settingsResponseValid(response) {
  return validateSettingsResponse(response).valid;
}

/**
 * Returns a copy of the response with timezone names canonicalised, so
 * aliases such as "us/eastern" are stored under the engine's canonical name.
 * Unresolvable names are kept so validation can report them.
 * @param {Object} response - The page response.
 * @return {Object} A shallow copy with canonical zone names.
 */
function canonicaliseResponse(response) {
  if (!response || !Array.isArray(response.zones)) return response;
  var copy = Object.assign({}, response);
  copy.zones = response.zones.map(function (zone) {
    if (!zone || typeof zone.timeZone !== "string") return zone;
    var canonical = rules.canonicalTimeZoneName(zone.timeZone);
    return canonical ? Object.assign({}, zone, { timeZone: canonical }) : zone;
  });
  return copy;
}

/**
 * Matches the native timezone_state_fingerprint() hash.
 * @param {Object} snapshot - Offset and transition data for one zone.
 * @return {number} The unsigned 32-bit fingerprint.
 */
function timezoneStateFingerprint(snapshot) {
  var fingerprint = (snapshot.offsetMinutes + 12 * 60) >>> 0;
  fingerprint = (fingerprint * 65599 + snapshot.transitionAt) >>> 0;
  fingerprint = (
    fingerprint * 65599
    + snapshot.transitionOffsetMinutes
    + 12 * 60
  ) >>> 0;
  return fingerprint;
}

function snapshotSendable(snapshot) {
  return Boolean(
    snapshot
    && integerInRange(snapshot.offsetMinutes, MIN_OFFSET_MINUTES, MAX_OFFSET_MINUTES)
    && snapshot.offsetMinutes % 15 === 0
    && integerInRange(snapshot.transitionOffsetMinutes, MIN_OFFSET_MINUTES, MAX_OFFSET_MINUTES)
    && snapshot.transitionOffsetMinutes % 15 === 0
  );
}

/**
 * Builds the per-zone part of a timezone or settings AppMessage.
 * @param {Array<Object>} zones - Normalised zones; disabled zones send UTC data.
 * @param {number} type - The message type.
 * @return {?{message: Object, transitionAt: number, zoneFingerprints: Array<number>}}
 *   The message, earliest transition, and fingerprints, or null when any zone
 *   cannot be represented on the watch.
 */
function timezoneMessage(zones, type) {
  var message = { TYPE: type };
  var nextTransitionAt = 0;
  var zoneFingerprints = [];
  var now = Date.now();
  for (var index = 0; index < zones.length; index += 1) {
    var zone = zones[index];
    var snapshot = timezone.timezoneSnapshot(zone.enabled ? zone.timeZone : "UTC", now);
    if (!snapshotSendable(snapshot)) return null;
    var prefix = "TZ_" + index + "_";
    message[prefix + "ENABLED"] = zone.enabled ? 1 : 0;
    message[prefix + "LABEL"] = zone.label;
    message[prefix + "TEXT_COLOR"] = zone.textColor;
    message[prefix + "BACKGROUND_COLOR"] = zone.backgroundColor;
    message[prefix + "UTC_OFFSET_MINUTES"] = snapshot.offsetMinutes;
    message[prefix + "TRANSITION_AT"] = snapshot.transitionAt;
    message[prefix + "TRANSITION_OFFSET_MINUTES"] = snapshot.transitionOffsetMinutes;
    zoneFingerprints.push(timezoneStateFingerprint(snapshot));
    if (
      snapshot.transitionAt > 0
      && (nextTransitionAt === 0 || snapshot.transitionAt < nextTransitionAt)
    ) {
      nextTransitionAt = snapshot.transitionAt;
    }
  }
  return {
    message: message,
    transitionAt: nextTransitionAt,
    zoneFingerprints: zoneFingerprints,
  };
}

/**
 * Builds the complete SETTINGS_UPDATE AppMessage for a validated response.
 * @param {Object} response - A response accepted by validateSettingsResponse.
 * @return {?Object} The timezoneMessage() result extended with display and
 *   slot keys, or null when timezone data is unavailable.
 */
function settingsUpdateMessage(response) {
  var update = timezoneMessage(response.zones, MessageType.SETTINGS_UPDATE);
  if (!update) return null;
  var message = update.message;
  message.H_ALIGN = response.display.horizontal;
  message.V_ALIGN = response.display.vertical;
  message.FONT_SIZE = response.display.fontSize;
  message.USE_DIGITS = response.display.useDigits === true ? 1 : 0;
  message.TZ_DIGITS_MASK = timezone.normaliseZones(response).reduce(function (mask, zone, index) {
    return mask | (zone.useDigits ? 1 << index : 0);
  }, 0);
  message.TEXT_COLOR = response.display.textColor;
  message.BACKGROUND_COLOR = response.display.backgroundColor;
  response.slots.forEach(function (slot, index) {
    message["SLOT_" + index + "_HOUR"] = slot.hour;
    message["SLOT_" + index + "_MINUTE"] = slot.minute;
    message["SLOT_" + index + "_ENABLED"] = slot.enabled ? 1 : 0;
  });
  return update;
}

/**
 * Checks whether every watch zone already holds the expected timezone data.
 * @param {Array<Object>} watchZones - Zones from a watch snapshot.
 * @param {Array<number>} fingerprints - Expected fingerprints.
 * @return {boolean} `true` when all fingerprints match.
 */
function fingerprintsMatch(watchZones, fingerprints) {
  if (
    !Array.isArray(watchZones)
    || !Array.isArray(fingerprints)
    || watchZones.length !== fingerprints.length
  ) return false;
  for (var index = 0; index < fingerprints.length; index += 1) {
    if (!watchZones[index] || watchZones[index].timezoneFingerprint !== fingerprints[index]) {
      return false;
    }
  }
  return true;
}

/**
 * Compares a watch snapshot with the settings the phone asked it to apply.
 * @param {Object} payload - The watch snapshot with normalised zones.
 * @param {Object} response - The pending settings response.
 * @param {Array<number>} zoneFingerprints - Fingerprints sent with the settings.
 * @return {boolean} `true` when the watch applied everything.
 */
function settingsSnapshotMatches(payload, response, zoneFingerprints) {
  if (
    !payload.display
    || !Array.isArray(payload.zones)
    || !Array.isArray(zoneFingerprints)
    || zoneFingerprints.length !== TIMEZONE_COUNT
  ) return false;
  if ((payload.display.useDigits === true) !== (response.display.useDigits === true)) return false;
  var displayKeys = ["horizontal", "vertical", "fontSize", "textColor", "backgroundColor"];
  for (var displayIndex = 0; displayIndex < displayKeys.length; displayIndex += 1) {
    var displayKey = displayKeys[displayIndex];
    if (payload.display[displayKey] !== response.display[displayKey]) return false;
  }
  if (!fingerprintsMatch(payload.zones, zoneFingerprints)) return false;
  var requestedZones = timezone.normaliseZones(response);
  for (var zoneIndex = 0; zoneIndex < TIMEZONE_COUNT; zoneIndex += 1) {
    var watchZone = payload.zones[zoneIndex];
    var requestedZone = requestedZones[zoneIndex];
    if (
      watchZone.enabled !== requestedZone.enabled
      || watchZone.useDigits !== requestedZone.useDigits
      || watchZone.label !== requestedZone.label
      || watchZone.textColor !== requestedZone.textColor
      || watchZone.backgroundColor !== requestedZone.backgroundColor
    ) return false;
  }
  for (var slotIndex = 0; slotIndex < response.slots.length; slotIndex += 1) {
    var watchSlot = payload.slots[slotIndex];
    var requestedSlot = response.slots[slotIndex];
    if (
      !watchSlot
      || watchSlot.id !== requestedSlot.id
      || watchSlot.hour !== requestedSlot.hour
      || watchSlot.minute !== requestedSlot.minute
      || watchSlot.enabled !== requestedSlot.enabled
    ) return false;
  }
  return true;
}

/**
 * Chooses when to refresh watch timezone data.
 * @param {?number} transitionAt - Next transition in seconds, 0 for none, or
 *   null when the last attempt failed and should be retried soon.
 * @param {number} now - The current time in milliseconds.
 * @return {number} The delay in milliseconds.
 */
function timezoneRefreshDelay(transitionAt, now) {
  if (transitionAt === null) return TIMEZONE_RETRY_DELAY_MS;
  var transitionDelay = transitionAt > 0
    ? transitionAt * 1000 - now + 60 * 1000
    : MAX_ZONE_REFRESH_DELAY_MS;
  return Math.max(60 * 1000, Math.min(transitionDelay, MAX_ZONE_REFRESH_DELAY_MS));
}

exports.MessageType = MessageType;
exports.displayValid = displayValid;
exports.slotsValid = slotsValid;
exports.validateSettingsResponse = validateSettingsResponse;
exports.settingsResponseValid = settingsResponseValid;
exports.canonicaliseResponse = canonicaliseResponse;
exports.timezoneStateFingerprint = timezoneStateFingerprint;
exports.timezoneMessage = timezoneMessage;
exports.settingsUpdateMessage = settingsUpdateMessage;
exports.fingerprintsMatch = fingerprintsMatch;
exports.settingsSnapshotMatches = settingsSnapshotMatches;
exports.timezoneRefreshDelay = timezoneRefreshDelay;
