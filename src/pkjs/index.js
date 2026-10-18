/*
 * PebbleKit JS entry point: wires host globals (Pebble, localStorage, timers)
 * into the phone bridge modules and handles watch messages.
 */
var reportPage = require("./report-page");
var timezone = require("./timezone");
var settings = require("./settings");
var history = require("./history");
var storage = require("./storage");
var timersModule = require("./timers");
var settingsDeliveryModule = require("./settings-delivery");
var webviewActions = require("./webview-actions");

var MessageType = settings.MessageType;
var normaliseZones = timezone.normaliseZones;
var SETTINGS_WARNING_PREFIX = settingsDeliveryModule.SETTINGS_WARNING_PREFIX;
var WATCH_REJECTED_WARNING = "Watch did not apply the saved settings. Reconnect it and reopen settings to retry.";

function log(message) {
  console.log(message);
}

var store = storage.createStore(localStorage, log);
var timers = timersModule.createTimers(
  function (callback, delay) { return setTimeout(callback, delay); },
  typeof clearTimeout === "function"
    ? function (handle) { clearTimeout(handle); }
    : null
);
var zoneRefreshTimer = null;

function sendAppMessage(message, success, failure) {
  Pebble.sendAppMessage(message, success, failure);
}

/**
 * Sends a JSON payload to the watch.
 * @param {number} type - The message type.
 * @param {*} payload - The payload to serialise.
 */
function send(type, payload) {
  sendAppMessage(
    { TYPE: type, PAYLOAD: JSON.stringify(payload) },
    function () {},
    function () { log("Phone message send failed for type " + type); }
  );
}

function requestSync() {
  send(MessageType.REQUEST_SYNC, {});
}

/**
 * Schedules the next timezone refresh.
 * @param {?number} transitionAt - Next transition in seconds, 0 for none, or
 *   null to retry soon after a failure.
 */
function scheduleTimezoneRefresh(transitionAt) {
  timers.cancel(zoneRefreshTimer);
  zoneRefreshTimer = timers.start(function () {
    zoneRefreshTimer = null;
    pushTimezoneUpdate(store.load().settings);
  }, settings.timezoneRefreshDelay(transitionAt, Date.now()));
}

/**
 * Sends current offsets and transitions for the stored zones.
 * @param {Object} storedSettings - Stored settings (may be legacy or null).
 * @param {function()=} complete - Called once the attempt finishes.
 * @param {Array<Object>=} watchZones - Zones from a watch snapshot; when their
 *   fingerprints already match, the redundant AppMessage is skipped.
 */
function pushTimezoneUpdate(storedSettings, complete, watchZones) {
  var update = settings.timezoneMessage(normaliseZones(storedSettings), MessageType.TIMEZONE_UPDATE);
  if (!update) {
    log("Named timezones unavailable on phone");
    scheduleTimezoneRefresh(null);
    if (complete) complete();
    return;
  }
  if (watchZones && settings.fingerprintsMatch(watchZones, update.zoneFingerprints)) {
    scheduleTimezoneRefresh(update.transitionAt);
    if (complete) complete();
    return;
  }
  sendAppMessage(
    update.message,
    function () {
      scheduleTimezoneRefresh(update.transitionAt);
      if (complete) complete();
    },
    function () {
      log("Phone timezone update failed");
      scheduleTimezoneRefresh(null);
      if (complete) complete();
    }
  );
}

var settingsDelivery = settingsDeliveryModule.createSettingsDelivery({
  store: store,
  timers: timers,
  sendAppMessage: sendAppMessage,
  requestSync: requestSync,
  scheduleTimezoneRefresh: scheduleTimezoneRefresh,
  log: log,
});

var actions = webviewActions.createWebviewActions({
  store: store,
  settingsDelivery: settingsDelivery,
  now: function () { return Date.now(); },
  log: log,
});

/**
 * Merges a received event batch into the stored history.
 * @param {Object} payload - Install identifier, events, and dropped-event count.
 */
function handleEventBatch(payload) {
  var state = store.load();
  var homeTimeZone = normaliseZones(state.settings)[0].timeZone;
  if (history.mergeEventBatch(state, payload, homeTimeZone, Date.now())) {
    store.save(state);
  }
}

function watchZonesFor(payload, priorZones) {
  var zones = Array.isArray(payload.zones) && payload.zones.length === priorZones.length
    ? payload.zones
    : priorZones;
  return zones.map(function (zone, index) {
    var normalised = timezone.normaliseZoneSettings(
      zone, index, payload.display && payload.display.useDigits
    );
    normalised.timeZone = priorZones[index].timeZone;
    normalised.timezoneFingerprint = zone && Number.isInteger(zone.timezoneFingerprint)
      ? zone.timezoneFingerprint
      : null;
    return normalised;
  });
}

/**
 * Stores a validated settings snapshot from the watch and confirms or
 * rejects pending phone settings.
 * @param {Object} payload - The watch settings snapshot.
 */
function handleSettings(payload) {
  if (
    !payload
    || typeof payload.installId !== "string"
    || !settings.slotsValid(payload.slots)
    || (payload.display !== undefined && !settings.displayValid(payload.display))
  ) {
    log("Watch settings snapshot invalid");
    return;
  }
  var state = store.load();
  payload.zones = watchZonesFor(payload, normaliseZones(state.settings));
  var pending = state.pendingSettings;
  if (
    pending
    && settings.settingsResponseValid(pending.response)
    && !settings.settingsSnapshotMatches(payload, pending.response, pending.zoneFingerprints)
  ) {
    state.warning = WATCH_REJECTED_WARNING;
    store.save(state);
    return;
  }
  state.pendingSettings = null;
  settingsDelivery.cancelRetry();
  if (state.warning && (state.warning === WATCH_REJECTED_WARNING
      || state.warning.indexOf(SETTINGS_WARNING_PREFIX) === 0)) {
    state.warning = null;
  }
  state.settings = payload;
  state.droppedEvents = Math.max(state.droppedEvents, Number(payload.droppedEvents) || 0);
  store.save(state);
  pushTimezoneUpdate(state.settings, null, payload.zones);
}

/**
 * Records the completion time of a synchronisation.
 * @param {Object} payload - Optional `syncedAt` timestamp.
 */
function handleSyncDone(payload) {
  var state = store.load();
  state.lastSyncAt = payload && typeof payload.syncedAt === "number"
    ? payload.syncedAt
    : Date.now();
  store.save(state);
}

var WATCH_HANDLERS = {};
WATCH_HANDLERS[MessageType.EVENT_BATCH] = handleEventBatch;
WATCH_HANDLERS[MessageType.SETTINGS_SNAPSHOT] = handleSettings;
WATCH_HANDLERS[MessageType.SYNC_DONE] = handleSyncDone;

Pebble.addEventListener("ready", function () {
  log("Number Watch phone bridge ready");
  if (settingsDelivery.hasPending()) {
    settingsDelivery.sendPending();
  } else {
    pushTimezoneUpdate(store.load().settings, requestSync);
  }
});

Pebble.addEventListener("appmessage", function (event) {
  var payload;
  try {
    payload = JSON.parse(event.payload.PAYLOAD || "{}");
  } catch (error) {
    log("Phone message payload invalid");
    return;
  }
  var type = event.payload.TYPE;
  if (Object.prototype.hasOwnProperty.call(WATCH_HANDLERS, type)) WATCH_HANDLERS[type](payload);
});

Pebble.addEventListener("showConfiguration", function () {
  if (settingsDelivery.hasPending()) {
    settingsDelivery.sendPending();
  } else {
    requestSync();
  }
  timers.start(function () {
    var html = reportPage.buildReportPage(store.load());
    Pebble.openURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
  }, 500);
});

Pebble.addEventListener("webviewclosed", function (event) {
  if (!event || !event.response) return;
  var response;
  try {
    response = JSON.parse(decodeURIComponent(event.response));
  } catch (error) {
    log("Report action ignored");
    return;
  }
  try {
    actions.dispatch(response);
  } catch (error) {
    log("Report action failed");
  }
});
