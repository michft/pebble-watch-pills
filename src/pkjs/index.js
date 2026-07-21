var reportPage = require("./report-page");

var STORAGE_KEY = "pebble-pills-phone-state-v1";
var NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

var MessageType = {
  EVENT_BATCH: 3,
  SETTINGS_SNAPSHOT: 5,
  SYNC_DONE: 6,
  REQUEST_SYNC: 7,
};

function defaultState() {
  return {
    version: 1,
    events: [],
    settings: null,
    lastSyncAt: null,
    droppedEvents: 0,
    warning: null,
  };
}

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
    return parsed;
  } catch (error) {
    console.log("Phone state load failed");
    var state = defaultState();
    state.warning = "Phone report data was reset after a read error.";
    return state;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (error) {
    console.log("Phone state save failed");
    return false;
  }
}

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

function requestSync() {
  send(MessageType.REQUEST_SYNC, {});
}

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

function prunePhoneHistory(state) {
  var cutoff = Date.now() - NINETY_DAYS_MS;
  state.events = state.events.filter(function (event) {
    return event.scheduledAt >= cutoff;
  });
}

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
    if (!isValidEvent(event, installId)) {
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

function handleSyncDone(payload) {
  var state = loadState();
  state.lastSyncAt = payload && typeof payload.syncedAt === "number"
    ? payload.syncedAt
    : Date.now();
  saveState(state);
}

Pebble.addEventListener("ready", function () {
  console.log("Pill Reminder phone bridge ready");
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
  var html = reportPage.buildReportPage(loadState());
  Pebble.openURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
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
      saveState(state);
    }
  } catch (error) {
    console.log("Report action ignored");
  }
});
