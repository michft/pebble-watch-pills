/*
 * Phone-side reminder history: merging watch event batches, clearing, and
 * selecting records by Home calendar day.
 *
 * "Last N days" always means today plus the previous N - 1 Home days, the same
 * definition the report summary cards and the page export use.
 */
var rules = require("./rules");
var timezone = require("./timezone");

var NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
var REPORT_RETENTION_DAYS = [7, 30];
var OUTCOMES = ["no_response", "taken", "skipped"];

function eventIdentity(event) {
  return event.installId + ":" + event.sequence;
}

/**
 * Validates an event before it is stored in phone-side history.
 * @param {Object} event - The event to validate.
 * @param {string} installId - The expected watch installation identifier.
 * @return {boolean} `true` if identity, scheduling, outcome, and response time are valid.
 */
function isValidEvent(event, installId) {
  return Boolean(
    event
    && event.installId === installId
    && Number.isInteger(event.sequence)
    && event.sequence > 0
    && Number.isInteger(event.slotId)
    && event.slotId >= 0
    && event.slotId < rules.SLOT_COUNT
    && typeof event.scheduledAt === "number"
    && isFinite(event.scheduledAt)
    && typeof event.localDay === "string"
    && OUTCOMES.indexOf(event.outcome) !== -1
    && (
      event.answeredAt === null
      || event.answeredAt === undefined
      || (typeof event.answeredAt === "number" && isFinite(event.answeredAt) && event.answeredAt > 0)
    )
  );
}

/**
 * Returns today's Home day key, falling back to UTC when Intl is unusable.
 * @param {string} homeTimeZone - The Home timezone.
 * @param {number} now - The current time in milliseconds.
 * @return {string} The day key.
 */
function homeTodayKey(homeTimeZone, now) {
  return timezone.dateKeyAt(homeTimeZone, now)
    || timezone.dateKeyAt("UTC", now)
    || new Date(now).toISOString().slice(0, 10);
}

function cleared(state, event) {
  return event.scheduledAt <= state.clearedBefore
    || (state.clearedThroughDay !== null && event.localDay <= state.clearedThroughDay);
}

/**
 * Merges a received event batch into the stored history.
 * Stored events keep their original Home day and chosen taken timezone.
 * @param {Object} state - The phone state to update.
 * @param {Object} payload - The batch with installId, events, and droppedEvents.
 * @param {string} homeTimeZone - The current Home timezone.
 * @param {number} now - The current time in milliseconds.
 * @return {boolean} `true` when the payload was well formed and merged.
 */
function mergeEventBatch(state, payload, homeTimeZone, now) {
  if (!payload || typeof payload.installId !== "string" || !Array.isArray(payload.events)) {
    return false;
  }
  var byIdentity = {};
  state.events.forEach(function (event) {
    var previous = byIdentity[eventIdentity(event)];
    var stored = Object.assign({}, event);
    stored.homeTimeZone = previous && previous.homeTimeZone
      ? previous.homeTimeZone
      : event.homeTimeZone || homeTimeZone;
    stored.localDay = event.localDay
      || timezone.dateKeyAt(stored.homeTimeZone, stored.scheduledAt)
      || timezone.dateKeyAt("UTC", stored.scheduledAt);
    if (!stored.localDay) return;
    stored.takenTimeZone = previous && previous.takenTimeZone
      ? previous.takenTimeZone
      : event.takenTimeZone || stored.homeTimeZone;
    byIdentity[eventIdentity(event)] = stored;
  });

  payload.events.forEach(function (event) {
    if (!isValidEvent(event, payload.installId)) return;
    var previous = byIdentity[eventIdentity(event)];
    var stored = Object.assign({}, event);
    stored.homeTimeZone = previous && previous.homeTimeZone
      ? previous.homeTimeZone
      : homeTimeZone;
    stored.localDay = previous && previous.localDay
      ? previous.localDay
      : timezone.dateKeyAt(stored.homeTimeZone, stored.scheduledAt)
        || event.localDay
        || timezone.dateKeyAt("UTC", stored.scheduledAt);
    if (!stored.localDay || (!previous && cleared(state, stored))) return;
    stored.takenTimeZone = previous && previous.takenTimeZone
      ? previous.takenTimeZone
      : stored.homeTimeZone;
    byIdentity[eventIdentity(event)] = stored;
  });

  state.events = Object.keys(byIdentity).map(function (identity) {
    return byIdentity[identity];
  }).filter(function (event) {
    return event.scheduledAt >= now - NINETY_DAYS_MS;
  }).sort(function (left, right) {
    return left.scheduledAt - right.scheduledAt;
  });
  state.droppedEvents = Math.max(state.droppedEvents, Number(payload.droppedEvents) || 0);
  return true;
}

/**
 * Selects events older than the latest `retentionDays` Home days.
 * @param {Array<Object>} events - Stored events with `localDay` keys.
 * @param {string} todayKey - Today's Home day key.
 * @param {number} retentionDays - Home days kept; 0 selects everything.
 * @return {Array<Object>} The events a clear would remove.
 */
function eventsToClear(events, todayKey, retentionDays) {
  if (retentionDays === 0) return events.slice();
  return events.filter(function (event) {
    return rules.olderThanHomeDays(event.localDay, todayKey, retentionDays);
  });
}

/**
 * Clears history, keeping the latest `retentionDays` Home days.
 * Cleared records are not re-imported when the watch resyncs them.
 * @param {Object} state - The phone state to update.
 * @param {number} retentionDays - 0 (clear all), 7, or 30.
 * @param {string} homeTimeZone - The Home timezone.
 * @param {number} now - The current time in milliseconds.
 * @return {boolean} `true` when the retention value was accepted.
 */
function clearHistory(state, retentionDays, homeTimeZone, now) {
  if (retentionDays === 0) {
    state.events = [];
    state.droppedEvents = 0;
    state.clearedBefore = Math.max(state.clearedBefore, now);
    return true;
  }
  if (REPORT_RETENTION_DAYS.indexOf(retentionDays) === -1) return false;
  var todayKey = homeTodayKey(homeTimeZone, now);
  var todayOrdinal = rules.dayOrdinal(todayKey);
  if (todayOrdinal === null) return false;
  var removed = eventsToClear(state.events, todayKey, retentionDays);
  state.events = state.events.filter(function (event) {
    return removed.indexOf(event) === -1;
  });
  var throughDay = rules.dayKeyFromOrdinal(todayOrdinal - retentionDays);
  if (state.clearedThroughDay === null || throughDay > state.clearedThroughDay) {
    state.clearedThroughDay = throughDay;
  }
  return true;
}

/**
 * Applies the taken-timezone choices made on the report page.
 * @param {Object} state - The phone state to update.
 * @param {Array<Object>} selections - Items with `identity` and `timeZone`.
 * @param {Array<string>} allowedZones - Timezones of enabled zones.
 */
function updateTakenZones(state, selections, allowedZones) {
  var chosen = {};
  selections.forEach(function (selection) {
    if (
      selection
      && typeof selection.identity === "string"
      && allowedZones.indexOf(selection.timeZone) !== -1
    ) {
      chosen[selection.identity] = selection.timeZone;
    }
  });
  state.events.forEach(function (event) {
    var identity = eventIdentity(event);
    if (chosen[identity]) event.takenTimeZone = chosen[identity];
  });
}

exports.REPORT_RETENTION_DAYS = REPORT_RETENTION_DAYS;
exports.eventIdentity = eventIdentity;
exports.isValidEvent = isValidEvent;
exports.homeTodayKey = homeTodayKey;
exports.mergeEventBatch = mergeEventBatch;
exports.eventsToClear = eventsToClear;
exports.clearHistory = clearHistory;
exports.updateTakenZones = updateTakenZones;
