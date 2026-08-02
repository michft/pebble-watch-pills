var reportPage = require("./report-page");
var timezone = require("./timezone");

var STORAGE_KEY = "pebble-pills-phone-state-v1";
var NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
var TIMEZONE_COUNT = 4;

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

function defaultZoneSettings(index) {
  var homeTimeZone = timezone.systemTimeZone();
  var defaults = [homeTimeZone, "UTC", "UTC", "UTC"];
  var timeZone = defaults[index] || "UTC";
  return {
    id: index,
    enabled: index === 0,
    timeZone: timeZone,
    label: timezone.labelForTimeZone(timeZone),
    textColor: index === 0 ? 0 : 1,
    backgroundColor: index === 0 ? 1 : 4,
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
  if (settings && Array.isArray(settings.zones) && settings.zones.length === TIMEZONE_COUNT) {
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

function settingsResponseValid(response) {
  if (
    !response
    || !response.display
    || !Array.isArray(response.slots)
    || response.slots.length !== 4
    || !integerInRange(response.display.horizontal, 0, 2)
    || !integerInRange(response.display.vertical, 0, 2)
    || !integerInRange(response.display.fontSize, 0, 2)
    || !integerInRange(response.display.textColor, 0, 9)
    || !integerInRange(response.display.backgroundColor, 0, 9)
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
      || !integerInRange(zone.textColor, 0, 9)
      || !integerInRange(zone.backgroundColor, 0, 9)
    ) {
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

function timezoneMessage(zones, type) {
  var message = { TYPE: type };
  var nextTransitionAt = 0;
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
    if (
      snapshot.transitionAt > 0
      && (nextTransitionAt === 0 || snapshot.transitionAt < nextTransitionAt)
    ) {
      nextTransitionAt = snapshot.transitionAt;
    }
  }
  return { message: message, transitionAt: nextTransitionAt };
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

function sendSettings(response) {
  if (!settingsResponseValid(response)) {
    console.log("Phone settings invalid");
    return;
  }
  var update = timezoneMessage(response.zones, MessageType.SETTINGS_UPDATE);
  if (!update) {
    console.log("Named timezones unavailable on phone");
    return;
  }
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
      scheduleTimezoneRefresh({ transitionAt: update.transitionAt });
      requestSync();
    },
    function () { console.log("Phone settings send failed"); }
  );
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
      || timezone.dateKeyAt(stored.homeTimeZone, stored.scheduledAt);
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
      : timezone.dateKeyAt(stored.homeTimeZone, stored.scheduledAt) || event.localDay;
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
    return normalised;
  });
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
  pushTimezoneUpdate(loadState().settings, requestSync);
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
      state.events = [];
      state.droppedEvents = 0;
      state.warning = null;
      state.clearedBefore = Date.now();
      saveState(state);
    } else if (response.action === "save_settings" && settingsResponseValid(response)) {
      var settingsState = loadState();
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
      saveState(settingsState);
      sendSettings(response);
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
