const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function bridge() {
  const handlers = {};
  const sent = [];
  const timers = [];
  let stored = null;
  const root = path.resolve(__dirname, "../src/pkjs");
  vm.runInNewContext(fs.readFileSync(path.join(root, "index.js"), "utf8"), {
    require(name) { return require(path.join(root, name)); },
    exports: {},
    console: { log() {} },
    localStorage: {
      getItem() { return stored; },
      setItem(key, value) { stored = value; },
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
    handlers, sent, timers,
    state() { return JSON.parse(stored); },
    save(backgroundColor = 19) {
      handlers.webviewclosed({ response: encodeURIComponent(JSON.stringify({
        action: "save_settings", appearance: "auto",
        display: { horizontal: 1, vertical: 1, fontSize: 2, useDigits: false, textColor: 1, backgroundColor },
        zones: Array.from({ length: 4 }, (_, id) => ({
          id, enabled: id === 0, useDigits: id === 1, timeZone: "UTC", label: "UTC",
          textColor: 1, backgroundColor,
        })),
        slots: Array.from({ length: 4 }, (_, id) => ({ id, hour: 8 + id * 3, minute: 0, enabled: true })),
      })) });
    },
    runRetry() {
      const index = timers.findIndex((timer) => !timer.cancelled && timer.delay >= 1000 && timer.delay <= 10000);
      assert.notEqual(index, -1, "pending settings need a bounded delivery/confirmation retry");
      timers.splice(index, 1)[0].callback();
    },
    confirm() {
      const pending = this.state().pendingSettings;
      handlers.appmessage({ payload: { TYPE: 5, PAYLOAD: JSON.stringify({
        installId: "watch", display: pending.response.display, slots: pending.response.slots,
        zones: pending.response.zones.map((zone, index) => ({
          ...zone, timezoneFingerprint: pending.zoneFingerprints[index],
        })),
      }) } });
    },
  };
}

test("reopening settings retries configuration after all delivery attempts fail", () => {
  const phone = bridge();
  phone.save();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    phone.sent.at(-1).failure();
    if (attempt < 2) phone.runRetry();
  }
  assert.match(phone.state().warning, /Reopen settings/);
  phone.handlers.showConfiguration();
  assert.equal(phone.sent.at(-1).message.TYPE, 8, "reopen must resend settings, not only request watch state");
  assert.equal(phone.sent.at(-1).message.TZ_DIGITS_MASK, 2);
});

test("successful transport without a watch confirmation retries, then remains pending", () => {
  const phone = bridge();
  phone.save();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(phone.sent.at(-1).message.TYPE, 8);
    phone.sent.at(-1).success();
    assert.equal(phone.sent.at(-1).message.TYPE, 7);
    phone.runRetry();
  }
  assert.equal(phone.sent.filter((entry) => entry.message.TYPE === 8).length, 3);
  assert.ok(phone.state().pendingSettings);
  assert.match(phone.state().warning, /confirm.*Reopen settings/i);
});

test("matching watch confirmation cancels retries and clears delivery warnings", () => {
  const phone = bridge();
  phone.save();
  phone.sent[0].failure();
  phone.confirm();
  assert.equal(phone.state().pendingSettings, null);
  assert.equal(phone.state().warning, null);
  assert.equal(phone.timers.filter((timer) => !timer.cancelled && timer.delay <= 10000).length, 0);
  assert.equal(phone.sent.filter((entry) => entry.message.TYPE === 8).length, 1);
});

test("a confirmation retry cannot replay settings superseded by a later save", () => {
  const phone = bridge();
  phone.save(10);
  phone.sent[0].success();
  const oldRetry = phone.timers.find((timer) => timer.delay === 5000);
  assert.ok(oldRetry);
  phone.save(19);
  oldRetry.callback();
  assert.deepEqual(phone.sent.filter((entry) => entry.message.TYPE === 8)
    .map((entry) => entry.message.BACKGROUND_COLOR), [10, 19]);
});
