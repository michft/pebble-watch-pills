/*
 * Delivers saved watch settings, retries failed sends, and waits for the
 * watch to confirm them with a matching SETTINGS_SNAPSHOT.
 *
 * Each save gets a generation number; callbacks for an older generation are
 * ignored and hand over to the newest pending settings instead.
 */
var settings = require("./settings");

var SETTINGS_RETRY_DELAY_MS = 1000;
var SETTINGS_CONFIRMATION_DELAY_MS = 5000;
var SETTINGS_MAX_ATTEMPTS = 3;
var SETTINGS_WARNING_PREFIX = "Watch settings delivery failed.";
var TIMEZONE_UNAVAILABLE = "Timezone data is unavailable on this phone.";

function isDeliveryWarning(warning) {
  return typeof warning === "string" && warning.indexOf(SETTINGS_WARNING_PREFIX) === 0;
}

/**
 * Creates the delivery state machine.
 * @param {Object} deps - Injected collaborators.
 * @param {Object} deps.store - State store from storage.createStore.
 * @param {Object} deps.timers - Timer helpers from timers.createTimers.
 * @param {function(Object, function, function)} deps.sendAppMessage - Sends a dictionary.
 * @param {function()} deps.requestSync - Asks the watch for a fresh snapshot.
 * @param {function(?number)} deps.scheduleTimezoneRefresh - Schedules timezone refreshes.
 * @param {function(string)} deps.log - Diagnostic logger.
 * @return {Object} Delivery controls.
 */
function createSettingsDelivery(deps) {
  var store = deps.store;
  var timers = deps.timers;
  var activeGeneration = null;
  var retryTimer = null;

  function stateFor(generation) {
    var state = store.load();
    return state.pendingSettings && state.pendingSettings.generation === generation
      ? state
      : null;
  }

  function finishAttempt(generation) {
    if (activeGeneration === generation) activeGeneration = null;
  }

  function cancelRetry() {
    timers.cancel(retryTimer);
    retryTimer = null;
  }

  function scheduleRetry(generation, deliveryAttempt, delay) {
    cancelRetry();
    var handle = timers.start(function () {
      if (retryTimer === handle) retryTimer = null;
      retryPending(generation, deliveryAttempt);
    }, delay);
    retryTimer = handle;
  }

  function retryPending(generation, deliveryAttempt) {
    var state = stateFor(generation);
    if (activeGeneration !== null || !state) return;
    if (deliveryAttempt >= SETTINGS_MAX_ATTEMPTS) {
      state.warning = SETTINGS_WARNING_PREFIX
        + " Watch confirmation missing. Reopen settings with the watch connected.";
      store.save(state);
      return;
    }
    activeGeneration = generation;
    attempt(generation, deliveryAttempt + 1);
  }

  function attempt(generation, deliveryAttempt) {
    var state = stateFor(generation);
    if (!state) {
      finishAttempt(generation);
      sendPending();
      return;
    }
    var response = state.pendingSettings.response;
    if (!settings.settingsResponseValid(response)) {
      finishAttempt(generation);
      deps.log("Phone settings invalid");
      return;
    }
    var update = settings.settingsUpdateMessage(response);
    if (!update) {
      deps.log("Named timezones unavailable on phone");
      onFailed(generation, deliveryAttempt, TIMEZONE_UNAVAILABLE);
      return;
    }
    state.pendingSettings.zoneFingerprints = update.zoneFingerprints;
    store.save(state);
    deps.sendAppMessage(
      update.message,
      function () { onSent(generation, deliveryAttempt, update.transitionAt); },
      function () { onFailed(generation, deliveryAttempt, null); }
    );
  }

  function onSent(generation, deliveryAttempt, transitionAt) {
    finishAttempt(generation);
    var state = stateFor(generation);
    if (!state) {
      sendPending();
      return;
    }
    if (isDeliveryWarning(state.warning)) {
      state.warning = null;
      store.save(state);
    }
    deps.scheduleTimezoneRefresh(transitionAt);
    scheduleRetry(generation, deliveryAttempt, SETTINGS_CONFIRMATION_DELAY_MS);
    deps.requestSync();
  }

  function onFailed(generation, deliveryAttempt, reason) {
    deps.log("Phone settings send failed");
    finishAttempt(generation);
    var state = stateFor(generation);
    if (!state) {
      sendPending();
      return;
    }
    var canRetry = deliveryAttempt < SETTINGS_MAX_ATTEMPTS;
    state.warning = SETTINGS_WARNING_PREFIX
      + (reason ? " " + reason : "")
      + (canRetry ? " Retrying." : " Reopen settings with the watch connected.");
    store.save(state);
    if (canRetry) {
      scheduleRetry(generation, deliveryAttempt, SETTINGS_RETRY_DELAY_MS * deliveryAttempt);
    }
  }

  /**
   * Starts delivering the newest pending settings unless a send is in flight.
   */
  function sendPending() {
    if (activeGeneration !== null) return;
    var pending = store.load().pendingSettings;
    if (!pending || !settings.settingsResponseValid(pending.response)) return;
    cancelRetry();
    activeGeneration = pending.generation;
    attempt(pending.generation, 1);
  }

  /**
   * Reports whether stored settings still await delivery or confirmation.
   * @return {boolean} `true` when valid pending settings exist.
   */
  function hasPending() {
    var pending = store.load().pendingSettings;
    return Boolean(pending && settings.settingsResponseValid(pending.response));
  }

  return {
    sendPending: sendPending,
    hasPending: hasPending,
    cancelRetry: cancelRetry,
  };
}

exports.SETTINGS_WARNING_PREFIX = SETTINGS_WARNING_PREFIX;
exports.TIMEZONE_UNAVAILABLE = TIMEZONE_UNAVAILABLE;
exports.isDeliveryWarning = isDeliveryWarning;
exports.createSettingsDelivery = createSettingsDelivery;
