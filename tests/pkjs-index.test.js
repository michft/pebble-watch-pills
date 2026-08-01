const assert = require("node:assert/strict");
const test = require("node:test");
const { timezoneSnapshot } = require("../src/pkjs/timezone.js");

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
    assert.deepEqual(JSON.parse(stored).events, [newEvent]);
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
        alternate: {
          timeZone: "Australia/Sydney",
          label: "SYDNEY",
          textColor: 1,
          backgroundColor: 4,
        },
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
    assert.equal(sent[0].message.USE_LOCAL_TIME, 1);
    assert.equal(sent[0].message.UTC_OFFSET_MINUTES, 0);
    assert.equal(sent[0].message.ALT_TZ_LABEL, "SYDNEY");
    const zone = timezoneSnapshot("Australia/Sydney", Date.now());
    assert.equal(sent[0].message.ALT_UTC_OFFSET_MINUTES, zone.offsetMinutes);
    assert.equal(sent[0].message.ALT_TRANSITION_AT, zone.transitionAt);
    assert.equal(
      sent[0].message.ALT_TRANSITION_OFFSET_MINUTES,
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
    assert.equal(sent[0].ALT_TZ_LABEL, "LONDON");
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
