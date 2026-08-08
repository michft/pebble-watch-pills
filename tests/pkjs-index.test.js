const assert = require("node:assert/strict");
const test = require("node:test");
const {
  dateKeyAt,
  systemTimeZone,
  timezoneSnapshot,
} = require("../src/pkjs/timezone.js");

const STORAGE_KEY = "pebble-pills-phone-state-v1";

function timezoneFingerprint(timeZone) {
  const snapshot = timezoneSnapshot(timeZone, Date.now());
  let fingerprint = (snapshot.offsetMinutes + 12 * 60) >>> 0;
  fingerprint = (fingerprint * 65_599 + snapshot.transitionAt) >>> 0;
  return (
    fingerprint * 65_599
    + snapshot.transitionOffsetMinutes
    + 12 * 60
  ) >>> 0;
}

test("cleared phone history stays clear when retained watch events resync", () => {
  const handlers = {};
  const clearedEvent = {
    installId: "watch",
    sequence: 1,
    slotId: 0,
    scheduledAt: Date.now() - 60_000,
    localDay: "2026-07-28",
    outcome: "taken",
    answeredAt: Date.now() - 59_000,
  };
  let stored = JSON.stringify({
    version: 1,
    events: [clearedEvent],
    settings: null,
    lastSyncAt: null,
    droppedEvents: 0,
    warning: null,
  });

  global.localStorage = {
    getItem(key) {
      return key === STORAGE_KEY ? stored : null;
    },
    setItem(key, value) {
      if (key === STORAGE_KEY) stored = value;
    },
  };
  global.Pebble = {
    addEventListener(name, handler) {
      handlers[name] = handler;
    },
    sendAppMessage() {},
  };

  const indexPath = require.resolve("../src/pkjs/index.js");
  delete require.cache[indexPath];
  try {
    const bridge = require(indexPath);
    assert.equal(bridge.TIMEZONE_COUNT, 4);
    assert.equal(bridge.normaliseZones(null).length, bridge.TIMEZONE_COUNT);
    handlers.webviewclosed({
      response: encodeURIComponent(JSON.stringify({ action: "clear_history" })),
    });

    const clearedState = JSON.parse(stored);
    assert.deepEqual(clearedState.events, []);
    assert.ok(clearedState.clearedBefore >= clearedEvent.scheduledAt);

    handlers.appmessage({
      payload: {
        TYPE: 3,
        PAYLOAD: JSON.stringify({
          installId: "watch",
          events: [clearedEvent],
          droppedEvents: 0,
        }),
      },
    });
    assert.deepEqual(JSON.parse(stored).events, []);

    const newEvent = {
      ...clearedEvent,
      sequence: 2,
      scheduledAt: clearedState.clearedBefore + 1,
      answeredAt: clearedState.clearedBefore + 2,
    };
    handlers.appmessage({
      payload: {
        TYPE: 3,
        PAYLOAD: JSON.stringify({
          installId: "watch",
          events: [newEvent],
          droppedEvents: 0,
        }),
      },
    });
    const storedEvent = JSON.parse(stored).events[0];
    assert.equal(storedEvent.sequence, newEvent.sequence);
    assert.equal(storedEvent.homeTimeZone, systemTimeZone());
    assert.equal(storedEvent.takenTimeZone, systemTimeZone());
    assert.equal(storedEvent.localDay, dateKeyAt(systemTimeZone(), newEvent.scheduledAt));
  } finally {
    delete require.cache[indexPath];
    delete global.localStorage;
    delete global.Pebble;
  }
});

test("clears records outside the selected retention window", () => {
  const handlers = {};
  const originalDateNow = Date.now;
  const now = Date.UTC(2026, 7, 8, 12);
  const day = 24 * 60 * 60 * 1000;
  const oldEvent = {
    installId: "watch",
    sequence: 1,
    slotId: 0,
    scheduledAt: now - 8 * day,
    localDay: "2026-07-31",
    outcome: "no_response",
    answeredAt: null,
  };
  const recentEvent = {
    ...oldEvent,
    sequence: 2,
    scheduledAt: now - 6 * day,
    localDay: "2026-08-02",
  };
  let stored = JSON.stringify({
    version: 1,
    events: [oldEvent, recentEvent],
    settings: null,
    lastSyncAt: null,
    droppedEvents: 2,
    warning: null,
    clearedBefore: 0,
  });

  Date.now = () => now;
  global.localStorage = {
    getItem() { return stored; },
    setItem(key, value) { if (key === STORAGE_KEY) stored = value; },
  };
  global.Pebble = {
    addEventListener(name, handler) { handlers[name] = handler; },
    sendAppMessage() {},
  };

  const indexPath = require.resolve("../src/pkjs/index.js");
  delete require.cache[indexPath];
  try {
    require(indexPath);
    handlers.webviewclosed({
      response: encodeURIComponent(JSON.stringify({
        action: "clear_history",
        retentionDays: 7,
      })),
    });

    let state = JSON.parse(stored);
    assert.deepEqual(state.events.map((event) => event.sequence), [2]);
    assert.equal(state.clearedBefore, now - 7 * day);
    assert.equal(state.droppedEvents, 2);

    handlers.appmessage({
      payload: {
        TYPE: 3,
        PAYLOAD: JSON.stringify({
          installId: "watch",
          events: [oldEvent],
          droppedEvents: 2,
        }),
      },
    });
    state = JSON.parse(stored);
    assert.deepEqual(state.events.map((event) => event.sequence), [2]);

    stored = JSON.stringify({
      version: 1,
      events: [
        { ...oldEvent, sequence: 3, scheduledAt: now - 31 * day },
        { ...recentEvent, sequence: 4, scheduledAt: now - 29 * day },
      ],
      settings: null,
      lastSyncAt: null,
      droppedEvents: 0,
      warning: null,
      clearedBefore: 0,
    });
    handlers.webviewclosed({
      response: encodeURIComponent(JSON.stringify({
        action: "clear_history",
        retentionDays: 30,
      })),
    });
    state = JSON.parse(stored);
    assert.deepEqual(state.events.map((event) => event.sequence), [4]);
    assert.equal(state.clearedBefore, now - 30 * day);
  } finally {
    delete require.cache[indexPath];
    delete global.localStorage;
    delete global.Pebble;
    Date.now = originalDateNow;
  }
});

test("resync preserves the original Home day and selected taken timezone", () => {
  const handlers = {};
  const event = {
    installId: "watch",
    sequence: 9,
    slotId: 0,
    scheduledAt: Date.UTC(2026, 7, 2, 14),
    localDay: "2026-08-03",
    homeTimeZone: "Australia/Sydney",
    takenTimeZone: "Asia/Tokyo",
    outcome: "taken",
    answeredAt: Date.UTC(2026, 7, 2, 14, 5),
  };
  let stored = JSON.stringify({
    version: 1,
    events: [event],
    settings: {
      zones: [
        { id: 0, enabled: true, timeZone: "Europe/Madrid", label: "MADRID" },
        { id: 1, enabled: true, timeZone: "Asia/Tokyo", label: "TOKYO" },
        { id: 2, enabled: false, timeZone: "UTC", label: "UTC" },
        { id: 3, enabled: false, timeZone: "UTC", label: "UTC" },
      ],
    },
    lastSyncAt: null,
    droppedEvents: 0,
    warning: null,
    clearedBefore: 0,
  });

  global.localStorage = {
    getItem() { return stored; },
    setItem(key, value) { if (key === STORAGE_KEY) stored = value; },
  };
  global.Pebble = {
    addEventListener(name, handler) { handlers[name] = handler; },
    sendAppMessage() {},
  };

  const indexPath = require.resolve("../src/pkjs/index.js");
  delete require.cache[indexPath];
  try {
    require(indexPath);
    handlers.appmessage({
      payload: {
        TYPE: 3,
        PAYLOAD: JSON.stringify({
          installId: "watch",
          events: [{
            installId: "watch",
            sequence: 9,
            slotId: 0,
            scheduledAt: event.scheduledAt,
            localDay: "2026-08-02",
            outcome: "taken",
            answeredAt: event.answeredAt,
          }],
          droppedEvents: 0,
        }),
      },
    });

    const resynced = JSON.parse(stored).events[0];
    assert.equal(resynced.homeTimeZone, "Australia/Sydney");
    assert.equal(resynced.localDay, "2026-08-03");
    assert.equal(resynced.takenTimeZone, "Asia/Tokyo");
  } finally {
    delete require.cache[indexPath];
    delete global.localStorage;
    delete global.Pebble;
  }
});

test("saving phone settings requests a full watch sync after delivery", () => {
  const handlers = {};
  const sent = [];
  let stored = null;

  global.localStorage = {
    getItem() {
      return stored;
    },
    setItem(key, value) {
      if (key === STORAGE_KEY) stored = value;
    },
  };
  global.Pebble = {
    addEventListener(name, handler) {
      handlers[name] = handler;
    },
    sendAppMessage(message, success) {
      sent.push({ message, success });
    },
  };

  const indexPath = require.resolve("../src/pkjs/index.js");
  delete require.cache[indexPath];
  try {
    require(indexPath);
    handlers.webviewclosed({
      response: encodeURIComponent(JSON.stringify({
        action: "save_settings",
        appearance: "dark",
        display: {
          horizontal: 1,
          vertical: 1,
          fontSize: 2,
          textColor: 12,
          backgroundColor: 19,
        },
        zones: [
          { id: 0, enabled: true, timeZone: "Australia/Sydney", label: "SYDNEY", textColor: 12, backgroundColor: 19 },
          { id: 1, enabled: true, timeZone: "Europe/London", label: "LONDON", textColor: 1, backgroundColor: 10 },
          { id: 2, enabled: true, timeZone: "Asia/Tokyo", label: "TOKYO", textColor: 1, backgroundColor: 13 },
          { id: 3, enabled: false, timeZone: "America/New_York", label: "NEW YORK", textColor: 1, backgroundColor: 17 },
        ],
        slots: [
          { id: 0, hour: 8, minute: 0, enabled: true },
          { id: 1, hour: 12, minute: 0, enabled: true },
          { id: 2, hour: 18, minute: 0, enabled: true },
          { id: 3, hour: 22, minute: 0, enabled: true },
        ],
      })),
    });

    assert.equal(sent.length, 1);
    assert.equal(sent[0].message.TYPE, 8);
    assert.equal(sent[0].message.TZ_0_ENABLED, 1);
    assert.equal(sent[0].message.TZ_0_LABEL, "SYDNEY");
    assert.equal(sent[0].message.TZ_0_TEXT_COLOR, 12);
    assert.equal(sent[0].message.TZ_0_BACKGROUND_COLOR, 19);
    assert.equal(sent[0].message.TZ_1_LABEL, "LONDON");
    assert.equal(sent[0].message.TZ_2_LABEL, "TOKYO");
    assert.equal(sent[0].message.TZ_3_ENABLED, 0);
    const zone = timezoneSnapshot("Australia/Sydney", Date.now());
    assert.equal(sent[0].message.TZ_0_UTC_OFFSET_MINUTES, zone.offsetMinutes);
    assert.equal(sent[0].message.TZ_0_TRANSITION_AT, zone.transitionAt);
    assert.equal(
      sent[0].message.TZ_0_TRANSITION_OFFSET_MINUTES,
      zone.transitionOffsetMinutes,
    );
    assert.equal(JSON.parse(stored).appearance, "dark");
    sent[0].success();
    assert.equal(sent.length, 2);
    assert.equal(sent[1].message.TYPE, 7);
    const fingerprints = JSON.parse(stored).pendingSettings.zoneFingerprints;

    const snapshot = (homeTextColor, homeBackgroundColor) => ({
      installId: "watch",
      revision: 2,
      droppedEvents: 0,
      hour12: false,
      display: {
        horizontal: 1,
        vertical: 1,
        fontSize: 2,
        textColor: homeTextColor,
        backgroundColor: homeBackgroundColor,
      },
      zones: [
        { id: 0, enabled: true, label: "SYDNEY", textColor: homeTextColor, backgroundColor: homeBackgroundColor, timezoneFingerprint: fingerprints[0] },
        { id: 1, enabled: true, label: "LONDON", textColor: 1, backgroundColor: 10, timezoneFingerprint: fingerprints[1] },
        { id: 2, enabled: true, label: "TOKYO", textColor: 1, backgroundColor: 13, timezoneFingerprint: fingerprints[2] },
        { id: 3, enabled: false, label: "NEW YORK", textColor: 1, backgroundColor: 17, timezoneFingerprint: fingerprints[3] },
      ],
      slots: [
        { id: 0, hour: 8, minute: 0, enabled: true },
        { id: 1, hour: 12, minute: 0, enabled: true },
        { id: 2, hour: 18, minute: 0, enabled: true },
        { id: 3, hour: 22, minute: 0, enabled: true },
      ],
    });
    handlers.appmessage({
      payload: { TYPE: 5, PAYLOAD: JSON.stringify(snapshot(5, 1)) },
    });
    let state = JSON.parse(stored);
    assert.equal(state.settings.zones[0].textColor, 12);
    assert.equal(state.settings.zones[0].backgroundColor, 19);
    assert.match(state.warning, /did not apply/);

    handlers.appmessage({
      payload: { TYPE: 5, PAYLOAD: JSON.stringify(snapshot(12, 19)) },
    });
    state = JSON.parse(stored);
    assert.equal(state.pendingSettings, null);
    assert.equal(state.settings.zones[0].textColor, 12);
    assert.equal(state.settings.zones[0].backgroundColor, 19);
    assert.equal(state.warning, null);
  } finally {
    delete require.cache[indexPath];
    delete global.localStorage;
    delete global.Pebble;
  }
});

test("keeps pending settings when only the timezone was not applied", () => {
  const handlers = {};
  const sent = [];
  const display = {
    horizontal: 1,
    vertical: 1,
    fontSize: 2,
    textColor: 1,
    backgroundColor: 19,
  };
  const slots = [
    { id: 0, hour: 8, minute: 0, enabled: true },
    { id: 1, hour: 12, minute: 0, enabled: true },
    { id: 2, hour: 18, minute: 0, enabled: true },
    { id: 3, hour: 22, minute: 0, enabled: true },
  ];
  const oldZones = [
    { id: 0, enabled: true, timeZone: "Australia/Sydney", label: "SYDNEY", textColor: 1, backgroundColor: 19 },
    { id: 1, enabled: false, timeZone: "UTC", label: "UTC", textColor: 1, backgroundColor: 10 },
    { id: 2, enabled: false, timeZone: "UTC", label: "UTC", textColor: 1, backgroundColor: 10 },
    { id: 3, enabled: false, timeZone: "UTC", label: "UTC", textColor: 1, backgroundColor: 10 },
  ];
  const newZones = oldZones.map((zone, index) => ({
    ...zone,
    timeZone: index === 0 ? "Australia/Brisbane" : zone.timeZone,
  }));
  let stored = JSON.stringify({
    version: 1,
    events: [],
    settings: {
      installId: "watch",
      revision: 1,
      droppedEvents: 0,
      hour12: false,
      display,
      zones: oldZones,
      slots,
    },
    lastSyncAt: null,
    droppedEvents: 0,
    warning: null,
    clearedBefore: 0,
    appearance: "auto",
  });

  global.localStorage = {
    getItem() { return stored; },
    setItem(key, value) { if (key === STORAGE_KEY) stored = value; },
  };
  global.Pebble = {
    addEventListener(name, handler) { handlers[name] = handler; },
    sendAppMessage(message) { sent.push(message); },
  };

  const indexPath = require.resolve("../src/pkjs/index.js");
  delete require.cache[indexPath];
  try {
    require(indexPath);
    handlers.webviewclosed({
      response: encodeURIComponent(JSON.stringify({
        action: "save_settings",
        appearance: "auto",
        display,
        zones: newZones,
        slots,
      })),
    });

    assert.equal(sent[0].TYPE, 8);
    let state = JSON.parse(stored);
    const expectedFingerprints = state.pendingSettings.zoneFingerprints;
    const oldFingerprint = timezoneFingerprint("Australia/Sydney");
    assert.notEqual(oldFingerprint, expectedFingerprints[0]);
    const snapshot = {
      installId: "watch",
      revision: 2,
      droppedEvents: 0,
      hour12: false,
      display,
      zones: oldZones.map((zone, index) => ({
        id: zone.id,
        enabled: zone.enabled,
        label: zone.label,
        textColor: zone.textColor,
        backgroundColor: zone.backgroundColor,
        timezoneFingerprint: index === 0
          ? oldFingerprint
          : expectedFingerprints[index],
      })),
      slots,
    };

    handlers.appmessage({
      payload: { TYPE: 5, PAYLOAD: JSON.stringify(snapshot) },
    });
    state = JSON.parse(stored);
    assert.equal(state.pendingSettings.response.zones[0].timeZone, "Australia/Brisbane");
    assert.match(state.warning, /did not apply/);

    snapshot.zones[0].timezoneFingerprint = expectedFingerprints[0];
    handlers.appmessage({
      payload: { TYPE: 5, PAYLOAD: JSON.stringify(snapshot) },
    });
    state = JSON.parse(stored);
    assert.equal(state.pendingSettings, null);
    assert.equal(state.settings.zones[0].timeZone, "Australia/Brisbane");
  } finally {
    delete require.cache[indexPath];
    delete global.localStorage;
    delete global.Pebble;
  }
});

test("ignores an old retry after newer watch settings are saved", () => {
  const handlers = {};
  const sent = [];
  const scheduled = [];
  const originalSetTimeout = global.setTimeout;
  let stored = null;
  let settingsAttempts = 0;

  global.localStorage = {
    getItem() { return stored; },
    setItem(key, value) { if (key === STORAGE_KEY) stored = value; },
  };
  global.Pebble = {
    addEventListener(name, handler) { handlers[name] = handler; },
    sendAppMessage(message, success, failure) {
      sent.push(message);
      if (message.TYPE !== 8) return;
      settingsAttempts += 1;
      if (settingsAttempts === 1) {
        failure();
      } else {
        success();
      }
    },
  };
  global.setTimeout = (callback, delay) => {
    scheduled.push({ callback, delay });
    return { unref() {} };
  };

  const indexPath = require.resolve("../src/pkjs/index.js");
  delete require.cache[indexPath];
  try {
    const response = (backgroundColor) => ({
      action: "save_settings",
      appearance: "auto",
      display: { horizontal: 1, vertical: 1, fontSize: 2, textColor: 1, backgroundColor },
      zones: [
        { id: 0, enabled: true, timeZone: "Australia/Sydney", label: "SYDNEY", textColor: 1, backgroundColor },
        { id: 1, enabled: false, timeZone: "UTC", label: "UTC", textColor: 1, backgroundColor: 10 },
        { id: 2, enabled: false, timeZone: "UTC", label: "UTC", textColor: 1, backgroundColor: 10 },
        { id: 3, enabled: false, timeZone: "UTC", label: "UTC", textColor: 1, backgroundColor: 10 },
      ],
      slots: [
        { id: 0, hour: 8, minute: 0, enabled: true },
        { id: 1, hour: 12, minute: 0, enabled: true },
        { id: 2, hour: 18, minute: 0, enabled: true },
        { id: 3, hour: 22, minute: 0, enabled: true },
      ],
    });
    require(indexPath);
    handlers.webviewclosed({
      response: encodeURIComponent(JSON.stringify(response(9))),
    });

    assert.equal(settingsAttempts, 1);
    assert.match(JSON.parse(stored).warning, /retry/i);
    assert.equal(scheduled[0].delay, 1_000);

    handlers.webviewclosed({
      response: encodeURIComponent(JSON.stringify(response(17))),
    });

    assert.equal(settingsAttempts, 2);
    assert.equal(sent[1].TZ_0_BACKGROUND_COLOR, 17);
    assert.equal(sent.at(-1).TYPE, 7);

    scheduled[0].callback();

    assert.equal(settingsAttempts, 2);
    assert.equal(JSON.parse(stored).warning, null);
    assert.equal(
      JSON.parse(stored).pendingSettings.response.zones[0].backgroundColor,
      17,
    );
  } finally {
    delete require.cache[indexPath];
    delete global.localStorage;
    delete global.Pebble;
    global.setTimeout = originalSetTimeout;
  }
});

test("rejects an unresolvable saved timezone and stores a report warning", () => {
  const handlers = {};
  const sent = [];
  let stored = null;

  global.localStorage = {
    getItem() { return stored; },
    setItem(key, value) { if (key === STORAGE_KEY) stored = value; },
  };
  global.Pebble = {
    addEventListener(name, handler) { handlers[name] = handler; },
    sendAppMessage(message) { sent.push(message); },
  };

  const indexPath = require.resolve("../src/pkjs/index.js");
  delete require.cache[indexPath];
  try {
    require(indexPath);
    handlers.webviewclosed({
      response: encodeURIComponent(JSON.stringify({
        action: "save_settings",
        appearance: "auto",
        display: { horizontal: 1, vertical: 1, fontSize: 2, textColor: 0, backgroundColor: 1 },
        zones: [
          { id: 0, enabled: true, timeZone: "Not/A_Zone", label: "HOME", textColor: 0, backgroundColor: 1 },
          { id: 1, enabled: false, timeZone: "UTC", label: "UTC", textColor: 1, backgroundColor: 4 },
          { id: 2, enabled: false, timeZone: "UTC", label: "UTC", textColor: 1, backgroundColor: 4 },
          { id: 3, enabled: false, timeZone: "UTC", label: "UTC", textColor: 1, backgroundColor: 4 },
        ],
        slots: [
          { id: 0, hour: 8, minute: 0, enabled: true },
          { id: 1, hour: 12, minute: 0, enabled: false },
          { id: 2, hour: 18, minute: 0, enabled: false },
          { id: 3, hour: 22, minute: 0, enabled: false },
        ],
      })),
    });

    const state = JSON.parse(stored);
    assert.equal(state.settings, null);
    assert.match(state.warning, /timezone.*Not\/A_Zone.*not saved/i);
    assert.deepEqual(sent, []);
  } finally {
    delete require.cache[indexPath];
    delete global.localStorage;
    delete global.Pebble;
  }
});

test("phone bridge refreshes named timezone before requesting watch sync", () => {
  const handlers = {};
  const sent = [];
  const stored = JSON.stringify({
    version: 1,
    events: [],
    settings: {
      alternate: {
        timeZone: "Europe/London",
        label: "LONDON",
        textColor: 0,
        backgroundColor: 7,
      },
    },
    lastSyncAt: null,
    droppedEvents: 0,
    warning: null,
    clearedBefore: 0,
  });

  global.localStorage = {
    getItem() {
      return stored;
    },
    setItem() {},
  };
  global.Pebble = {
    addEventListener(name, handler) {
      handlers[name] = handler;
    },
    sendAppMessage(message, success) {
      sent.push(message);
      if (success) success();
    },
  };

  const indexPath = require.resolve("../src/pkjs/index.js");
  delete require.cache[indexPath];
  try {
    require(indexPath);
    handlers.ready();

    assert.equal(sent[0].TYPE, 9);
    assert.equal(sent[0].TZ_1_LABEL, "LONDON");
    assert.equal(sent[1].TYPE, 7);
  } finally {
    delete require.cache[indexPath];
    delete global.localStorage;
    delete global.Pebble;
  }
});

test("phone bridge retries when named timezone cannot be resolved", () => {
  const handlers = {};
  const sent = [];
  const scheduled = [];
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const stored = JSON.stringify({
    version: 1,
    events: [],
    settings: {
      alternate: {
        timeZone: "Not/A_Zone",
        label: "UNKNOWN",
        textColor: 0,
        backgroundColor: 7,
      },
    },
    lastSyncAt: null,
    droppedEvents: 0,
    warning: null,
    clearedBefore: 0,
  });

  global.localStorage = {
    getItem() {
      return stored;
    },
    setItem() {},
  };
  global.Pebble = {
    addEventListener(name, handler) {
      handlers[name] = handler;
    },
    sendAppMessage(message) {
      sent.push(message);
    },
  };
  global.setTimeout = (callback, delay) => {
    scheduled.push({ callback, delay });
    return { unref() {} };
  };
  global.clearTimeout = () => {};

  const indexPath = require.resolve("../src/pkjs/index.js");
  delete require.cache[indexPath];
  try {
    require(indexPath);
    handlers.ready();

    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].delay, 60_000);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].TYPE, 7);
  } finally {
    delete require.cache[indexPath];
    delete global.localStorage;
    delete global.Pebble;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});
