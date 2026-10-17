const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const timezone = require("../src/pkjs/timezone.js");
const settings = require("../src/pkjs/settings.js");
const storage = require("../src/pkjs/storage.js");
const history = require("../src/pkjs/history.js");

const root = path.resolve(__dirname, "../src/pkjs");
const keys = require("../package.json").pebble.messageKeys;

function bridge(initialState = null) {
  const handlers = {};
  const sent = [];
  const timers = [];
  const writes = { count: 0 };
  let stored = initialState === null ? null : JSON.stringify(initialState);
  vm.runInNewContext(fs.readFileSync(path.join(root, "index.js"), "utf8"), {
    require(name) { return require(path.join(root, name)); },
    console: { log() {} },
    localStorage: {
      getItem() { return stored; },
      setItem(key, value) { writes.count += 1; stored = value; },
    },
    setTimeout(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout(timer) { timer.cancelled = true; },
    Pebble: {
      addEventListener(name, handler) { handlers[name] = handler; },
      sendAppMessage(message, success, failure) { sent.push({ message, success, failure }); },
      openURL() {},
    },
  });
  return {
    handlers, sent, timers, writes,
    state() { return JSON.parse(stored); },
    close(response) {
      handlers.webviewclosed({ response: encodeURIComponent(JSON.stringify(response)) });
    },
    snapshot(payload) {
      handlers.appmessage({ payload: { TYPE: 5, PAYLOAD: JSON.stringify(payload) } });
    },
  };
}

function saveResponse(zoneOverrides = {}) {
  return {
    action: "save_settings",
    appearance: "auto",
    display: { horizontal: 1, vertical: 1, fontSize: 2, useDigits: false, textColor: 1, backgroundColor: 19 },
    zones: Array.from({ length: 4 }, (_, id) => ({
      id, enabled: id === 0, useDigits: false, timeZone: "UTC", label: "UTC",
      textColor: 1, backgroundColor: 19, ...(zoneOverrides[id] || {}),
    })),
    slots: Array.from({ length: 4 }, (_, id) => ({ id, hour: 8 + id * 3, minute: 0, enabled: true })),
  };
}

function withSnapshotStub(stub, callback) {
  const original = timezone.timezoneSnapshot;
  timezone.timezoneSnapshot = stub;
  try {
    return callback();
  } finally {
    timezone.timezoneSnapshot = original;
  }
}

test("disabled zones do not need a resolvable timezone, enabled zones do", () => {
  const phone = bridge();
  phone.close(saveResponse({ 2: { timeZone: "Not/A_Zone", enabled: false } }));
  assert.equal(phone.sent.at(-1).message.TYPE, 8);
  assert.equal(phone.sent.at(-1).message.TZ_2_ENABLED, 0);
  assert.equal(phone.sent.at(-1).message.TZ_2_UTC_OFFSET_MINUTES, 0);

  const rejected = bridge();
  rejected.close(saveResponse({ 2: { timeZone: "Not/A_Zone", enabled: true } }));
  assert.deepEqual(rejected.sent, []);
  assert.match(rejected.state().warning, /Not\/A_Zone.*not saved/);
});

test("saving rejects settings whose timezone data cannot be sent, with a page warning", () => {
  const phone = bridge();
  withSnapshotStub(() => null, () => phone.close(saveResponse()));
  assert.deepEqual(phone.sent, []);
  const state = phone.state();
  assert.equal(state.settings, null);
  assert.equal(state.pendingSettings, null);
  assert.match(state.warning, /^Watch settings delivery failed\. Timezone data is unavailable.*not saved/);
});

test("pending settings retry with a warning when timezone data becomes unavailable", () => {
  const phone = bridge();
  phone.close(saveResponse());
  phone.sent.at(-1).failure();
  const retry = phone.timers.find((timer) => !timer.cancelled && timer.delay === 1000);
  assert.ok(retry);
  const before = phone.sent.length;
  withSnapshotStub(() => null, () => retry.callback());
  assert.equal(phone.sent.length, before, "nothing is sent without timezone data");
  assert.match(phone.state().warning, /Timezone data is unavailable.*Retrying/);
  assert.ok(phone.state().pendingSettings, "settings stay pending");
  const nextRetry = phone.timers.find((timer) => !timer.cancelled && timer.delay === 2000);
  assert.ok(nextRetry, "a later retry is scheduled");
  nextRetry.callback();
  assert.equal(phone.sent.at(-1).message.TYPE, 8);
});

test("timezone aliases are stored under canonical names", () => {
  const canonical = new Intl.DateTimeFormat("en-US", { timeZone: "us/eastern" })
    .resolvedOptions().timeZone;
  const phone = bridge();
  phone.close(saveResponse({ 1: { timeZone: "us/eastern", enabled: true, label: "EASTERN" } }));
  assert.equal(phone.state().settings.zones[1].timeZone, canonical);
  assert.equal(phone.state().pendingSettings.response.zones[1].timeZone, canonical);
});

test("settings messages only use declared keys and omit legacy single-zone keys", () => {
  const phone = bridge();
  phone.close(saveResponse());
  const message = phone.sent.at(-1).message;
  for (const key of Object.keys(message)) assert.ok(keys.includes(key), key);
  for (const legacy of ["USE_LOCAL_TIME", "UTC_OFFSET_MINUTES", "ALT_TZ_LABEL", "ALT_TRANSITION_AT"]) {
    assert.equal(keys.includes(legacy), false, legacy);
    assert.equal(legacy in message, false, legacy);
  }
});

test("a confirmed snapshot with current timezone data does not resend timezones", () => {
  const phone = bridge();
  phone.close(saveResponse({ 1: { timeZone: "Australia/Sydney", enabled: true, label: "SYDNEY" } }));
  phone.sent.at(-1).success();
  const pending = phone.state().pendingSettings;
  const snapshot = (fingerprints) => ({
    installId: "watch",
    display: pending.response.display,
    slots: pending.response.slots,
    zones: pending.response.zones.map((zone, index) => ({
      ...zone, timezoneFingerprint: fingerprints[index],
    })),
  });
  const before = phone.sent.length;
  phone.snapshot(snapshot(pending.zoneFingerprints));
  assert.equal(phone.state().pendingSettings, null);
  assert.equal(phone.sent.length, before, "no redundant TIMEZONE_UPDATE");
  assert.ok(phone.timers.some((timer) => !timer.cancelled && timer.delay > 60_000),
    "the next transition refresh is still scheduled");

  const stale = pending.zoneFingerprints.map((fingerprint, index) => index === 1 ? fingerprint + 1 : fingerprint);
  phone.snapshot(snapshot(stale));
  assert.equal(phone.sent.at(-1).message.TYPE, 9, "outdated watch timezone data is refreshed");
});

test("invalid watch snapshots are ignored instead of stored", () => {
  const phone = bridge();
  const valid = {
    installId: "watch",
    display: { horizontal: 1, vertical: 1, fontSize: 2, useDigits: false, textColor: 0, backgroundColor: 1 },
    slots: Array.from({ length: 4 }, (_, id) => ({ id, hour: 8 + id, minute: 0, enabled: true })),
  };
  for (const slots of [
    [{ id: 0, hour: "8' onfocus='x", minute: 0, enabled: true }, ...valid.slots.slice(1)],
    [{ ...valid.slots[0], hour: 24 }, ...valid.slots.slice(1)],
    [{ ...valid.slots[0], minute: 0 }, { ...valid.slots[1], hour: 8, minute: 1 }, ...valid.slots.slice(2)],
    [...valid.slots.slice(0, 3), { ...valid.slots[3], id: 7 }],
    valid.slots.slice(0, 3),
  ]) {
    phone.snapshot({ ...valid, slots });
    assert.equal(phone.writes.count, 0, JSON.stringify(slots[0]));
  }
  phone.snapshot({ ...valid, display: { ...valid.display, fontSize: "<b>" } });
  assert.equal(phone.writes.count, 0);
  phone.snapshot(valid);
  assert.deepEqual(phone.state().settings.slots, valid.slots);
});

test("events with malformed response times are not stored", () => {
  const base = {
    installId: "watch", sequence: 1, slotId: 0, scheduledAt: Date.now(),
    localDay: "2026-08-01", outcome: "taken", answeredAt: Date.now(),
  };
  assert.equal(history.isValidEvent(base, "watch"), true);
  assert.equal(history.isValidEvent({ ...base, answeredAt: null }, "watch"), true);
  for (const answeredAt of ["soon", Number.NaN, Infinity, -5, 0, {}]) {
    assert.equal(history.isValidEvent({ ...base, answeredAt }, "watch"), false, String(answeredAt));
  }
  assert.equal(history.isValidEvent({ ...base, scheduledAt: Number.NaN }, "watch"), false);
});

test("state store caches parsed state and only re-parses changed data", () => {
  let raw = JSON.stringify({ ...storage.defaultState(), events: [{ sequence: 1 }] });
  const store = storage.createStore({
    getItem() { return raw; },
    setItem(key, value) { if (key === storage.STORAGE_KEY) raw = value; },
  }, () => {});
  const originalParse = JSON.parse;
  let parses = 0;
  JSON.parse = (...args) => { parses += 1; return originalParse(...args); };
  try {
    const first = store.load();
    assert.equal(store.load(), first);
    first.lastSyncAt = 5;
    store.save(first);
    assert.equal(store.load().lastSyncAt, 5);
    assert.equal(parses, 1);
    raw = JSON.stringify({ ...storage.defaultState(), lastSyncAt: 9 });
    assert.equal(store.load().lastSyncAt, 9, "external changes are noticed");
    assert.equal(parses, 2);
  } finally {
    JSON.parse = originalParse;
  }
});

test("unsupported state versions reset with a warning and keep a backup", () => {
  const items = {};
  const logs = [];
  const futureState = JSON.stringify({ version: 99, events: [{ sequence: 1 }] });
  items[storage.STORAGE_KEY] = futureState;
  const store = storage.createStore({
    getItem(key) { return items[key] ?? null; },
    setItem(key, value) { items[key] = value; },
  }, (message) => logs.push(message));
  const state = store.load();
  assert.deepEqual(state.events, []);
  assert.match(state.warning, /unsupported app version/);
  assert.equal(items[storage.UNSUPPORTED_BACKUP_KEY], futureState);
  assert.match(logs.join("\n"), /version 99 unsupported/);
});

test("registered migrations upgrade older state versions", () => {
  const originalVersion = storage.STATE_VERSION;
  assert.equal(originalVersion, 1);
  storage.MIGRATIONS[0] = (state) => ({ ...state, version: 1, lastSyncAt: 42 });
  try {
    const store = storage.createStore({
      getItem() { return JSON.stringify({ version: 0, events: [] }); },
      setItem() {},
    }, () => {});
    const state = store.load();
    assert.equal(state.version, 1);
    assert.equal(state.lastSyncAt, 42);
    assert.equal(state.warning, null);
  } finally {
    delete storage.MIGRATIONS[0];
  }
});

test("timezone refresh delay retries soon after failures and waits for transitions", () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(settings.timezoneRefreshDelay(null, now), 60_000);
  assert.equal(settings.timezoneRefreshDelay(0, now), 20 * 24 * 60 * 60 * 1000);
  assert.equal(settings.timezoneRefreshDelay(now / 1000 + 3600, now), 3600_000 + 60_000);
  assert.equal(settings.timezoneRefreshDelay(now / 1000 - 3600, now), 60_000);
});
