var reportPage = require("./report-page");

var STORAGE_KEY = "pebble-pills-phone-state-v1";
var NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

var MessageType = {
  EVENT_BATCH: 3,
  SETTINGS_SNAPSHOT: 5,
  SYNC_DONE: 6,
  REQUEST_SYNC: 7,
  SETTINGS_UPDATE: 8,
};

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
    || typeof response.display.useLocalTime !== "boolean"
    || !integerInRange(response.display.utcOffsetMinutes, -12 * 60, 14 * 60)
    || response.display.utcOffsetMinutes % 15 !== 0
  ) {
    return false;
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

function sendSettings(response) {
  if (!settingsResponseValid(response)) {
    console.log("Phone settings invalid");
    return;
  }
  var message = {
    TYPE: MessageType.SETTINGS_UPDATE,
    H_ALIGN: response.display.horizontal,
    V_ALIGN: response.display.vertical,
    FONT_SIZE: response.display.fontSize,
    TEXT_COLOR: response.display.textColor,
    BACKGROUND_COLOR: response.display.backgroundColor,
    USE_LOCAL_TIME: response.display.useLocalTime ? 1 : 0,
    UTC_OFFSET_MINUTES: response.display.utcOffsetMinutes,
  };
  response.slots.forEach(function (slot, index) {
    message["SLOT_" + index + "_HOUR"] = slot.hour;
    message["SLOT_" + index + "_MINUTE"] = slot.minute;
    message["SLOT_" + index + "_ENABLED"] = slot.enabled ? 1 : 0;
  });
  Pebble.sendAppMessage(
    message,
    function () {
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
  var byIdentity = {};
  state.events.forEach(function (event) {
    byIdentity[event.installId + ":" + event.sequence] = event;
  });

  payload.events.forEach(function (event) {
    if (
      !isValidEvent(event, installId)
      || event.scheduledAt <= state.clearedBefore
    ) {
      return;
    }
    byIdentity[event.installId + ":" + event.sequence] = event;
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
  state.settings = payload;
  state.droppedEvents = Math.max(
    state.droppedEvents,
    Number(payload.droppedEvents) || 0
  );
  saveState(state);
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
  requestSync();
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
        slots: response.slots,
      };
      saveState(settingsState);
      sendSettings(response);
    }
  } catch (error) {
    console.log("Report action ignored");
  }
});
