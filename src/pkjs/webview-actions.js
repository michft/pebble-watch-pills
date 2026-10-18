/*
 * Handles responses posted by the report page when it closes.
 * Each page action has one named handler; unknown actions are ignored.
 */
var history = require("./history");
var settings = require("./settings");
var timezone = require("./timezone");
var delivery = require("./settings-delivery");

/**
 * Creates the dispatcher.
 * @param {Object} deps - Injected collaborators.
 * @param {Object} deps.store - State store.
 * @param {Object} deps.settingsDelivery - From createSettingsDelivery.
 * @param {function(): number} deps.now - Current time in milliseconds.
 * @param {function(string)} deps.log - Diagnostic logger.
 * @return {{dispatch: function(Object)}} The dispatcher.
 */
function createWebviewActions(deps) {
  var store = deps.store;

  function homeTimeZone(state) {
    return timezone.normaliseZones(state.settings)[0].timeZone;
  }

  function clearHistoryAction(response) {
    var state = store.load();
    var retentionDays = response.retentionDays === undefined ? 0 : response.retentionDays;
    if (history.clearHistory(state, retentionDays, homeTimeZone(state), deps.now())) {
      store.save(state);
    }
  }

  function saveSettingsAction(rawResponse) {
    var state = store.load();
    var response = settings.canonicaliseResponse(rawResponse);
    var validation = settings.validateSettingsResponse(response);
    if (!validation.valid) {
      if (validation.warning) {
        state.warning = validation.warning;
        store.save(state);
      }
      return;
    }
    if (!settings.timezoneMessage(response.zones, settings.MessageType.SETTINGS_UPDATE)) {
      state.warning = delivery.SETTINGS_WARNING_PREFIX + " " + delivery.TIMEZONE_UNAVAILABLE
        + " Settings were not saved.";
      store.save(state);
      return;
    }
    var prior = state.settings || {};
    state.settings = {
      installId: prior.installId || null,
      revision: prior.revision || 0,
      droppedEvents: prior.droppedEvents || 0,
      hour12: Boolean(prior.hour12),
      display: response.display,
      zones: response.zones,
      slots: response.slots,
    };
    state.appearance = response.appearance;
    state.settingsGeneration += 1;
    state.pendingSettings = {
      generation: state.settingsGeneration,
      response: response,
      zoneFingerprints: null,
    };
    state.warning = null;
    store.save(state);
    deps.settingsDelivery.sendPending();
  }

  function updateTakenZonesAction(response) {
    if (!Array.isArray(response.events)) return;
    var state = store.load();
    var allowedZones = timezone.normaliseZones(state.settings)
      .filter(function (zone) { return zone.enabled; })
      .map(function (zone) { return zone.timeZone; });
    history.updateTakenZones(state, response.events, allowedZones);
    store.save(state);
  }

  function closeAction() {}

  var ACTIONS = {
    clear_history: clearHistoryAction,
    save_settings: saveSettingsAction,
    update_taken_zones: updateTakenZonesAction,
    close: closeAction,
  };

  /**
   * Routes one decoded page response to its handler.
   * @param {Object} response - The decoded page response.
   */
  function dispatch(response) {
    if (!response || typeof response.action !== "string") return;
    var handler = Object.prototype.hasOwnProperty.call(ACTIONS, response.action)
      ? ACTIONS[response.action]
      : null;
    if (handler) handler(response);
    else deps.log("Report action ignored");
  }

  return { dispatch: dispatch };
}

exports.createWebviewActions = createWebviewActions;
