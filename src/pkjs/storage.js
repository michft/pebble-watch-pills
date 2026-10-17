/*
 * Versioned phone-side state persistence with an in-memory copy.
 *
 * The parsed state is cached against the raw stored string, so repeated loads
 * in one delivery cycle do not re-parse up to 90 days of events. Callers that
 * mutate a loaded state must save it.
 */
var STORAGE_KEY = "pebble-pills-phone-state-v1";
var UNSUPPORTED_BACKUP_KEY = STORAGE_KEY + "-unsupported-backup";
var STATE_VERSION = 1;
var APPEARANCES = ["auto", "light", "dark"];

/**
 * Upgrades stored state one version at a time: MIGRATIONS[n] converts a
 * version n state into version n + 1. Add an entry and bump STATE_VERSION
 * whenever the stored shape changes incompatibly.
 */
var MIGRATIONS = {};

/**
 * Creates an empty phone-side synchronisation state.
 * @return {Object} A fresh state with no events, settings, or warnings.
 */
function defaultState() {
  return {
    version: STATE_VERSION,
    events: [],
    settings: null,
    lastSyncAt: null,
    droppedEvents: 0,
    warning: null,
    clearedBefore: 0,
    clearedThroughDay: null,
    appearance: "auto",
    settingsGeneration: 0,
    pendingSettings: null,
  };
}

/**
 * Fills defaults and repairs optional fields of a current-version state.
 * @param {Object} parsed - A state already at STATE_VERSION.
 * @return {Object} The normalised state.
 */
function normaliseState(parsed) {
  parsed.settings = parsed.settings || null;
  parsed.lastSyncAt = parsed.lastSyncAt || null;
  parsed.droppedEvents = Number(parsed.droppedEvents) || 0;
  parsed.warning = parsed.warning || null;
  parsed.clearedBefore = Number(parsed.clearedBefore) || 0;
  parsed.clearedThroughDay = typeof parsed.clearedThroughDay === "string"
    && /^\d{4}-\d{2}-\d{2}$/.test(parsed.clearedThroughDay)
    ? parsed.clearedThroughDay
    : null;
  parsed.appearance = APPEARANCES.indexOf(parsed.appearance) !== -1
    ? parsed.appearance
    : "auto";
  parsed.settingsGeneration = Number.isInteger(parsed.settingsGeneration)
    && parsed.settingsGeneration >= 0
    ? parsed.settingsGeneration
    : 0;
  parsed.pendingSettings = parsed.pendingSettings || null;
  if (parsed.pendingSettings && !parsed.pendingSettings.response) {
    // Early builds stored the raw settings response as pendingSettings.
    parsed.settingsGeneration = Math.max(parsed.settingsGeneration, 1);
    parsed.pendingSettings = {
      generation: parsed.settingsGeneration,
      response: parsed.pendingSettings,
      zoneFingerprints: null,
    };
  }
  return parsed;
}

/**
 * Applies registered migrations until the state reaches STATE_VERSION.
 * @param {Object} parsed - The parsed stored state.
 * @return {?Object} The migrated state, or null when no path exists.
 */
function migrate(parsed) {
  var state = parsed;
  while (Number.isInteger(state.version) && state.version < STATE_VERSION) {
    var step = MIGRATIONS[state.version];
    if (typeof step !== "function") return null;
    state = step(state);
  }
  return state.version === STATE_VERSION ? state : null;
}

/**
 * Creates a store bound to a localStorage-like object.
 * @param {Object} storage - Provides getItem and setItem.
 * @param {function(string)} log - Diagnostic logger.
 * @return {{load: function(): Object, save: function(Object): boolean}} The store.
 */
function createStore(storage, log) {
  var cached = false;
  var cachedRaw = null;
  var cachedState = null;

  function remember(raw, state) {
    cached = true;
    cachedRaw = raw;
    cachedState = state;
    return state;
  }

  function resetWithWarning(raw, message, warning) {
    log(message);
    try {
      storage.setItem(UNSUPPORTED_BACKUP_KEY, raw);
    } catch (error) {
      log("Phone state backup failed");
    }
    var state = defaultState();
    state.warning = warning;
    return remember(raw, state);
  }

  function load() {
    var raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (error) {
      log("Phone state load failed");
      var unreadable = defaultState();
      unreadable.warning = "Phone report data was reset after a read error.";
      return unreadable;
    }
    if (cached && raw === cachedRaw) return cachedState;
    if (!raw) return remember(raw, defaultState());

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return resetWithWarning(raw, "Phone state load failed",
        "Phone report data was reset after a read error.");
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.events)) {
      return resetWithWarning(raw, "Phone state malformed",
        "Phone report data was reset because it was unreadable.");
    }
    var migrated = migrate(parsed);
    if (!migrated) {
      return resetWithWarning(raw, "Phone state version " + parsed.version + " unsupported",
        "Phone report data from an unsupported app version was reset. A backup was kept on the phone.");
    }
    return remember(raw, normaliseState(migrated));
  }

  function save(state) {
    var raw;
    try {
      raw = JSON.stringify(state);
      storage.setItem(STORAGE_KEY, raw);
    } catch (error) {
      log("Phone state save failed");
      // Keep the in-memory copy authoritative until a later save succeeds.
      if (cached) cachedState = state;
      return false;
    }
    remember(raw, state);
    return true;
  }

  return { load: load, save: save };
}

exports.STORAGE_KEY = STORAGE_KEY;
exports.UNSUPPORTED_BACKUP_KEY = UNSUPPORTED_BACKUP_KEY;
exports.STATE_VERSION = STATE_VERSION;
exports.MIGRATIONS = MIGRATIONS;
exports.createStore = createStore;
exports.defaultState = defaultState;
