var reportPage = require("./report-page");
var colorSchemes = require("./color-schemes");
var timezone = require("./timezone");

var STORAGE_KEY = "pebble-pills-phone-state-v1";
var NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
var REPORT_RETENTION_DAYS = [7, 30];
var TIMEZONE_COUNT = timezone.TIMEZONE_COUNT;
var normaliseZoneSettings = timezone.normaliseZoneSettings;
var normaliseZones = timezone.normaliseZones;

exports.TIMEZONE_COUNT = TIMEZONE_COUNT;
exports.normaliseZones = normaliseZones;

var MessageType = {
  EVENT_BATCH: 3,
  SETTINGS_SNAPSHOT: 5,
  SYNC_DONE: 6,
  REQUEST_SYNC: 7,
  SETTINGS_UPDATE: 8,
  TIMEZONE_UPDATE: 9,
};

var zoneRefreshTimer = null;
var MAX_ZONE_REFRESH_DELAY_MS = 20 * 24 * 60 * 60 * 1000;
var SETTINGS_RETRY_DELAY_MS = 1000;
var SETTINGS_MAX_ATTEMPTS = 3;
var SETTINGS_WARNING_PREFIX = "Watch settings delivery failed.";
var settingsDeliveryGeneration = null;

/**
 * Creates an empty phone-side synchronisation state.
 * @return {Object} A fresh version 1 state with no events, settings, warnings, or dropped events.
 */
function defaultState() {
  return {
    version: 1,
    events: [],
    settings: null,
    lastSyncAt: null,
    droppedEvents: 0,
    warning: null,
    clearedBefore: 0,
    appearance: "auto",
    settingsGeneration: 0,
    pendingSettings: null,
  };
}

/**
 * Loads and normalises the persisted phone-side state.
 * @return {Object} The stored state, or a default state; includes a warning when a read error resets the data.
 */
function loadState() {
  try {
    var serialized = localStorage.getItem(STORAGE_KEY);
    if (!serialized) {
      return defaultState();
    }
    var parsed = JSON.parse(serialized);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.events)) {
      return defaultState();
    }
    parsed.settings = parsed.settings || null;
    parsed.lastSyncAt = parsed.lastSyncAt || null;
    parsed.droppedEvents = Number(parsed.droppedEvents) || 0;
    parsed.warning = parsed.warning || null;
    parsed.clearedBefore = Number(parsed.clearedBefore) || 0;
    parsed.appearance = ["auto", "light", "dark"].indexOf(parsed.appearance) !== -1
      ? parsed.appearance
      : "auto";
    parsed.settingsGeneration = Number.isInteger(parsed.settingsGeneration)
      && parsed.settingsGeneration >= 0
      ? parsed.settingsGeneration
      : 0;
    parsed.pendingSettings = parsed.pendingSettings || null;
    if (parsed.pendingSettings && !parsed.pendingSettings.response) {
      parsed.settingsGeneration = Math.max(parsed.settingsGeneration, 1);
      parsed.pendingSettings = {
        generation: parsed.settingsGeneration,
        response: parsed.pendingSettings,
        zoneFingerprints: null,
      };
    }
    return parsed;
  } catch (error) {
    console.log("Phone state load failed");
    var state = defaultState();
    state.warning = "Phone report data was reset after a read error.";
    return state;
  }
}

/**
 * Persists the phone-side state in local storage.
 * @param {Object} state - The state to persist.
 * @return {boolean} `true` if the state was saved, `false` if saving failed.
 */
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.log("Phone state save failed");
    return false;
  }
}

/**
 * Sends a payload to the watch using a Pebble app message.
 * @param {number} type - The message type.
 * @param {*} payload - The message payload to serialise.
 */
function send(type, payload) {
  Pebble.sendAppMessage(
    {
      TYPE: type,
      PAYLOAD: JSON.stringify(payload),
    },
    function () {},
    function () {
      console.log("Phone message send failed for type " + type);
    }
  );
}

/**
 * Requests the watch to synchronise its current data.
 */
function requestSync() {
  send(MessageType.REQUEST_SYNC, {});
}

function integerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function settingsResponseValid(response, state) {
  if (
    !response
    || !response.display
    || !Array.isArray(response.slots)
    || response.slots.length !== 4
    || !integerInRange(response.display.horizontal, 0, 2)
    || !integerInRange(response.display.vertical, 0, 2)
    || !integerInRange(response.display.fontSize, 0, 2)
    || !colorSchemes.colorIdValid(response.display.textColor)
    || !colorSchemes.colorIdValid(response.display.backgroundColor)
    || ["auto", "light", "dark"].indexOf(response.appearance) === -1
    || !Array.isArray(response.zones)
    || response.zones.length !== TIMEZONE_COUNT
  ) {
    return false;
  }
  for (var zoneIndex = 0; zoneIndex < response.zones.length; zoneIndex += 1) {
    var zone = response.zones[zoneIndex];
    if (
      !zone
      || zone.id !== zoneIndex
      || typeof zone.enabled !== "boolean"
      || zoneIndex === 0 && !zone.enabled
      || typeof zone.timeZone !== "string"
      || zone.timeZone.length < 1
      || zone.timeZone.length > 64
      || typeof zone.label !== "string"
      || !/^[A-Z0-9 ]{1,8}$/.test(zone.label)
      || !colorSchemes.colorIdValid(zone.textColor)
      || !colorSchemes.colorIdValid(zone.backgroundColor)
    ) {
      return false;
    }
    if (timezone.offsetMinutesAt(zone.timeZone, Date.now()) === null) {
      if (state) {
        state.warning = "Timezone " + zone.timeZone
          + " was not saved because it could not be resolved.";
      }
      return false;
    }
  }
  for (var index = 0; index < response.slots.length; index += 1) {
    var slot = response.slots[index];
    if (
      !slot
      || slot.id !== index
      || !integerInRange(slot.hour, 0, 23)
      || !integerInRange(slot.minute, 0, 59)
      || typeof slot.enabled !== "boolean"
    ) {
      return false;
    }
    if (!slot.enabled) continue;
    for (var otherIndex = index + 1; otherIndex < response.slots.length; otherIndex += 1) {
      var other = response.slots[otherIndex];
      if (!other.enabled) continue;
      var leftMinutes = slot.hour * 60 + slot.minute;
      var rightMinutes = other.hour * 60 + other.minute;
      var gap = Math.abs(leftMinutes - rightMinutes);
      gap = Math.min(gap, 1440 - gap);
      if (gap < 2) return false;
    }
  }
  return true;
}

function settingsSnapshotMatches(payload, response, zoneFingerprints) {
  if (
    !payload.display
    || !Array.isArray(payload.zones)
    || !Array.isArray(zoneFingerprints)
    || zoneFingerprints.length !== TIMEZONE_COUNT
  ) return false;
  var displayKeys = ["horizontal", "vertical", "fontSize", "textColor", "backgroundColor"];
  for (var displayIndex = 0; displayIndex < displayKeys.length; displayIndex += 1) {
    var displayKey = displayKeys[displayIndex];
    if (payload.display[displayKey] !== response.display[displayKey]) return false;
  }
  for (var zoneIndex = 0; zoneIndex < TIMEZONE_COUNT; zoneIndex += 1) {
    var watchZone = payload.zones[zoneIndex];
    var requestedZone = response.zones[zoneIndex];
    if (
      !watchZone
      || watchZone.enabled !== requestedZone.enabled
      || watchZone.label !== requestedZone.label
      || watchZone.textColor !== requestedZone.textColor
      || watchZone.backgroundColor !== requestedZone.backgroundColor
      || watchZone.timezoneFingerprint !== zoneFingerprints[zoneIndex]
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

function timezoneMessage(zones, type) {
  var message = { TYPE: type };
  var nextTransitionAt = 0;
  var zoneFingerprints = [];
  for (var index = 0; index < zones.length; index += 1) {
    var zone = zones[index];
    var snapshot = timezone.timezoneSnapshot(
      zone.enabled ? zone.timeZone : "UTC",
      Date.now()
    );
    if (
      !snapshot
      || !integerInRange(snapshot.offsetMinutes, -12 * 60, 14 * 60)
      || snapshot.offsetMinutes % 15 !== 0
      || !integerInRange(snapshot.transitionOffsetMinutes, -12 * 60, 14 * 60)
      || snapshot.transitionOffsetMinutes % 15 !== 0
    ) {
      return null;
    }
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

function scheduleTimezoneRefresh(snapshot) {
  if (zoneRefreshTimer && typeof clearTimeout === "function") {
    clearTimeout(zoneRefreshTimer);
  }
  var transitionDelay = snapshot.transitionAt > 0
    ? snapshot.transitionAt * 1000 - Date.now() + 60 * 1000
    : MAX_ZONE_REFRESH_DELAY_MS;
  var delay = Math.max(60 * 1000, Math.min(transitionDelay, MAX_ZONE_REFRESH_DELAY_MS));
  zoneRefreshTimer = setTimeout(function () {
    pushTimezoneUpdate(loadState().settings);
  }, delay);
  if (zoneRefreshTimer && typeof zoneRefreshTimer.unref === "function") {
    zoneRefreshTimer.unref();
  }
}

function scheduleTimezoneRetry() {
  if (zoneRefreshTimer && typeof clearTimeout === "function") {
    clearTimeout(zoneRefreshTimer);
  }
  zoneRefreshTimer = setTimeout(function () {
    pushTimezoneUpdate(loadState().settings);
  }, 60 * 1000);
  if (zoneRefreshTimer && typeof zoneRefreshTimer.unref === "function") {
    zoneRefreshTimer.unref();
  }
}

function pushTimezoneUpdate(settings, complete) {
  var zones = normaliseZones(settings);
  var update = timezoneMessage(zones, MessageType.TIMEZONE_UPDATE);
  if (!update) {
    console.log("Named timezones unavailable on phone");
    scheduleTimezoneRetry();
    if (complete) complete();
    return;
  }
  Pebble.sendAppMessage(
    update.message,
    function () {
      scheduleTimezoneRefresh({ transitionAt: update.transitionAt });
      if (complete) complete();
    },
    function () {
      console.log("Phone timezone update failed");
      scheduleTimezoneRetry();
      if (complete) complete();
    }
  );
}

function sendSettingsAttempt(pending, deliveryAttempt) {
  var response = pending.response;
  var generation = pending.generation;
  if (!settingsResponseValid(response)) {
    settingsDeliveryGeneration = null;
    console.log("Phone settings invalid");
    return;
  }
  var update = timezoneMessage(response.zones, MessageType.SETTINGS_UPDATE);
  if (!update) {
    settingsDeliveryGeneration = null;
    console.log("Named timezones unavailable on phone");
    return;
  }
  var pendingState = loadState();
  if (
    !pendingState.pendingSettings
    || pendingState.pendingSettings.generation !== generation
  ) {
    settingsDeliveryGeneration = null;
    sendPendingSettings();
    return;
  }
  pendingState.pendingSettings.zoneFingerprints = update.zoneFingerprints;
  saveState(pendingState);
  var message = update.message;
  message.H_ALIGN = response.display.horizontal;
  message.V_ALIGN = response.display.vertical;
  message.FONT_SIZE = response.display.fontSize;
  message.TEXT_COLOR = response.display.textColor;
  message.BACKGROUND_COLOR = response.display.backgroundColor;
  message.USE_LOCAL_TIME = 1;
  message.UTC_OFFSET_MINUTES = 0;
  response.slots.forEach(function (slot, index) {
    message["SLOT_" + index + "_HOUR"] = slot.hour;
    message["SLOT_" + index + "_MINUTE"] = slot.minute;
    message["SLOT_" + index + "_ENABLED"] = slot.enabled ? 1 : 0;
  });
  Pebble.sendAppMessage(
    message,
    function () {
      if (settingsDeliveryGeneration === generation) {
        settingsDeliveryGeneration = null;
      }
      var state = loadState();
      if (
        !state.pendingSettings
        || state.pendingSettings.generation !== generation
      ) {
        sendPendingSettings();
        return;
      }
      if (state.warning && state.warning.indexOf(SETTINGS_WARNING_PREFIX) === 0) {
        state.warning = null;
        saveState(state);
      }
      scheduleTimezoneRefresh({ transitionAt: update.transitionAt });
      requestSync();
    },
    function () {
      console.log("Phone settings send failed");
      if (settingsDeliveryGeneration === generation) {
        settingsDeliveryGeneration = null;
      }
      var state = loadState();
      if (
        !state.pendingSettings
        || state.pendingSettings.generation !== generation
      ) {
        sendPendingSettings();
        return;
      }
      state.warning = deliveryAttempt < SETTINGS_MAX_ATTEMPTS
        ? SETTINGS_WARNING_PREFIX + " Retrying."
        : SETTINGS_WARNING_PREFIX + " Reopen settings with the watch connected.";
      saveState(state);
      if (deliveryAttempt < SETTINGS_MAX_ATTEMPTS) {
        setTimeout(function () {
          var retryState = loadState();
          if (
            settingsDeliveryGeneration !== null
            || !retryState.pendingSettings
            || retryState.pendingSettings.generation !== generation
          ) return;
          settingsDeliveryGeneration = generation;
          sendSettingsAttempt(retryState.pendingSettings, deliveryAttempt + 1);
        }, SETTINGS_RETRY_DELAY_MS * deliveryAttempt);
      }
    }
  );
}

function sendPendingSettings() {
  if (settingsDeliveryGeneration !== null) return;
  var state = loadState();
  var pending = state.pendingSettings;
  if (!pending || !settingsResponseValid(pending.response)) return;
  settingsDeliveryGeneration = pending.generation;
  sendSettingsAttempt(pending, 1);
}

/**
 * Validates an event before it is stored in phone-side history.
 * @param {Object} event - The event to validate.
 * @param {string} installId - The expected watch installation identifier.
 * @returns {boolean} `true` if the event has valid identifying, scheduling, slot, and outcome data, `false` otherwise.
 */
function isValidEvent(event, installId) {
  return Boolean(
    event
    && event.installId === installId
    && Number.isInteger(event.sequence)
    && event.sequence > 0
    && Number.isInteger(event.slotId)
    && event.slotId >= 0
    && event.slotId < 4
    && typeof event.scheduledAt === "number"
    && typeof event.localDay === "string"
    && (
      event.outcome === "no_response"
      || event.outcome === "taken"
      || event.outcome === "skipped"
    )
  );
}

/**
 * Removes phone history entries older than the 90-day retention window.
 * @param {Object} state - The persisted phone state whose events are pruned.
 */
function prunePhoneHistory(state) {
  var cutoff = Date.now() - NINETY_DAYS_MS;
  state.events = state.events.filter(function (event) {
    return event.scheduledAt >= cutoff;
  });
}

/**
 * Merges a received event batch into the stored event history.
 * @param {Object} payload - The batch containing the installation identifier, events, and dropped-event count.
 */
function handleEventBatch(payload) {
  if (
    !payload
    || typeof payload.installId !== "string"
    || !Array.isArray(payload.events)
  ) {
    return;
  }

  var state = loadState();
  var installId = payload.installId;
  var homeTimeZone = normaliseZones(state.settings)[0].timeZone;
  var byIdentity = {};
  state.events.forEach(function (event) {
    var identity = event.installId + ":" + event.sequence;
    var previous = byIdentity[identity];
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
    byIdentity[identity] = stored;
  });

  payload.events.forEach(function (event) {
    if (
      !isValidEvent(event, installId)
      || event.scheduledAt <= state.clearedBefore
    ) {
      return;
    }
    var identity = event.installId + ":" + event.sequence;
    var previous = byIdentity[identity];
    var stored = Object.assign({}, event);
    stored.homeTimeZone = previous && previous.homeTimeZone
      ? previous.homeTimeZone
      : homeTimeZone;
    stored.localDay = previous && previous.localDay
      ? previous.localDay
      : timezone.dateKeyAt(stored.homeTimeZone, stored.scheduledAt)
        || event.localDay
        || timezone.dateKeyAt("UTC", stored.scheduledAt);
    if (!stored.localDay) return;
    stored.takenTimeZone = previous && previous.takenTimeZone
      ? previous.takenTimeZone
      : stored.homeTimeZone;
    byIdentity[identity] = stored;
  });

  state.events = Object.keys(byIdentity).map(function (identity) {
    return byIdentity[identity];
  });
  state.events.sort(function (left, right) {
    return left.scheduledAt - right.scheduledAt;
  });
  state.droppedEvents = Math.max(
    state.droppedEvents,
    Number(payload.droppedEvents) || 0
  );
  prunePhoneHistory(state);

  saveState(state);
}

/**
 * Stores a settings snapshot received from the watch.
 * @param {Object} payload - The settings snapshot, including an installation identifier and four slot definitions.
 */
function handleSettings(payload) {
  if (
    !payload
    || typeof payload.installId !== "string"
    || !Array.isArray(payload.slots)
    || payload.slots.length !== 4
  ) {
    return;
  }
  var state = loadState();
  var priorZones = normaliseZones(state.settings);
  var watchZones = Array.isArray(payload.zones) && payload.zones.length === TIMEZONE_COUNT
    ? payload.zones
    : priorZones;
  payload.zones = watchZones.map(function (zone, index) {
    var normalised = normaliseZoneSettings(zone, index);
    normalised.timeZone = priorZones[index].timeZone;
    normalised.timezoneFingerprint = Number.isInteger(zone.timezoneFingerprint)
      ? zone.timezoneFingerprint
      : null;
    return normalised;
  });
  if (
    state.pendingSettings
    && settingsResponseValid(state.pendingSettings.response)
    && !settingsSnapshotMatches(
      payload,
      state.pendingSettings.response,
      state.pendingSettings.zoneFingerprints
    )
  ) {
    state.warning = "Watch did not apply the saved settings. Reconnect it and reopen settings to retry.";
    saveState(state);
    return;
  }
  state.pendingSettings = null;
  if (state.warning && state.warning.indexOf("Watch did not apply") === 0) {
    state.warning = null;
  }
  state.settings = payload;
  state.droppedEvents = Math.max(
    state.droppedEvents,
    Number(payload.droppedEvents) || 0
  );
  saveState(state);
  pushTimezoneUpdate(state.settings);
}

/**
 * Records the completion time of a synchronisation.
 * @param {Object} payload - The synchronisation payload containing an optional completion timestamp.
 */
function handleSyncDone(payload) {
  var state = loadState();
  state.lastSyncAt = payload && typeof payload.syncedAt === "number"
    ? payload.syncedAt
    : Date.now();
  saveState(state);
}

Pebble.addEventListener("ready", function () {
  console.log("Number Watch phone bridge ready");
  var state = loadState();
  if (state.pendingSettings && settingsResponseValid(state.pendingSettings.response)) {
    sendPendingSettings();
  } else {
    pushTimezoneUpdate(state.settings, requestSync);
  }
});

Pebble.addEventListener("appmessage", function (event) {
  var type = event.payload.TYPE;
  var payload;
  try {
    payload = JSON.parse(event.payload.PAYLOAD || "{}");
  } catch (error) {
    console.log("Phone message payload invalid");
    return;
  }

  if (type === MessageType.EVENT_BATCH) {
    handleEventBatch(payload);
  } else if (type === MessageType.SETTINGS_SNAPSHOT) {
    handleSettings(payload);
  } else if (type === MessageType.SYNC_DONE) {
    handleSyncDone(payload);
  }
});

Pebble.addEventListener("showConfiguration", function () {
  requestSync();
  setTimeout(function () {
    var html = reportPage.buildReportPage(loadState());
    Pebble.openURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  }, 500);
});

Pebble.addEventListener("webviewclosed", function (event) {
  if (!event || !event.response) {
    return;
  }
  try {
    var response = JSON.parse(decodeURIComponent(event.response));
    if (response.action === "clear_history") {
      var state = loadState();
      var retentionDays = response.retentionDays === undefined
        ? 0
        : response.retentionDays;
      if (retentionDays !== 0 && REPORT_RETENTION_DAYS.indexOf(retentionDays) === -1) {
        return;
      }
      var cutoff = retentionDays === 0
        ? Date.now()
        : Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      state.events = retentionDays === 0
        ? []
        : state.events.filter(function (storedEvent) {
          return storedEvent.scheduledAt > cutoff;
        });
      if (retentionDays === 0) state.droppedEvents = 0;
      state.clearedBefore = Math.max(state.clearedBefore, cutoff);
      saveState(state);
    } else if (response.action === "save_settings") {
      var settingsState = loadState();
      if (!settingsResponseValid(response, settingsState)) {
        saveState(settingsState);
        return;
      }
      var prior = settingsState.settings || {};
      settingsState.settings = {
        installId: prior.installId || null,
        revision: prior.revision || 0,
        droppedEvents: prior.droppedEvents || 0,
        hour12: Boolean(prior.hour12),
        display: response.display,
        zones: response.zones,
        slots: response.slots,
      };
      settingsState.appearance = response.appearance;
      settingsState.settingsGeneration += 1;
      settingsState.pendingSettings = {
        generation: settingsState.settingsGeneration,
        response: response,
        zoneFingerprints: null,
      };
      settingsState.warning = null;
      saveState(settingsState);
      sendPendingSettings();
    } else if (response.action === "update_taken_zones" && Array.isArray(response.events)) {
      var historyState = loadState();
      var allowedZones = normaliseZones(historyState.settings)
        .filter(function (zone) { return zone.enabled; })
        .map(function (zone) { return zone.timeZone; });
      var selections = {};
      response.events.forEach(function (selection) {
        if (
          selection
          && typeof selection.identity === "string"
          && allowedZones.indexOf(selection.timeZone) !== -1
        ) {
          selections[selection.identity] = selection.timeZone;
        }
      });
      historyState.events.forEach(function (storedEvent) {
        var identity = storedEvent.installId + ":" + storedEvent.sequence;
        if (selections[identity]) storedEvent.takenTimeZone = selections[identity];
      });
      saveState(historyState);
    }
  } catch (error) {
    console.log("Report action ignored");
  }
});
