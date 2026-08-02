const assert = require("node:assert/strict");
const test = require("node:test");
const {
  dateKeyAt,
  systemTimeZone,
  timezoneSnapshot,
} = require("../src/pkjs/timezone.js");

const STORAGE_KEY = "pebble-pills-phone-state-v1";

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
    require(indexPath);
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
        display: {
          horizontal: 1,
          vertical: 1,
          fontSize: 2,
          textColor: 0,
          backgroundColor: 1,
        },
        zones: [
          { id: 0, enabled: true, timeZone: "Australia/Sydney", label: "SYDNEY", textColor: 0, backgroundColor: 1 },
          { id: 1, enabled: true, timeZone: "Europe/London", label: "LONDON", textColor: 1, backgroundColor: 4 },
          { id: 2, enabled: true, timeZone: "Asia/Tokyo", label: "TOKYO", textColor: 1, backgroundColor: 4 },
          { id: 3, enabled: false, timeZone: "America/New_York", label: "NEW YORK", textColor: 1, backgroundColor: 4 },
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
    sent[0].success();
    assert.equal(sent.length, 2);
    assert.equal(sent[1].message.TYPE, 7);
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
