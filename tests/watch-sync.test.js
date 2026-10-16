const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const compiler = process.env.CC ?? "cc";
const flags = ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror"];
const keys = require("../package.json").pebble.messageKeys;

function compileSync(directory) {
  const keyFile = path.join(directory, "message_keys.c");
  fs.writeFileSync(keyFile, "#include <stdint.h>\n"
    + keys.map((key, index) => `uint32_t MESSAGE_KEY_${key} = ${index};`).join("\n") + "\n");
  const binary = path.join(directory, "sync-test");
  childProcess.execFileSync(compiler, [
    ...flags, "-Itests/host", "-Isrc/c",
    "src/c/phone_sync.c", "src/c/display_settings.c", "src/c/persist_state.c",
    "src/c/scheduler.c", "src/c/display_time.c",
    "tests/host/pebble_fake.c", "tests/watch_sync_test.c", keyFile, "-o", binary,
  ], { cwd: root, stdio: "pipe" });
  return binary;
}

function phoneSettingsMessage() {
  const handlers = {};
  const stored = {};
  let phoneMessage;
  const bridgePath = path.join(root, "src/pkjs/index.js");
  vm.runInNewContext(fs.readFileSync(bridgePath, "utf8"), {
    require: require("node:module").createRequire(bridgePath), exports: {}, module: { exports: {} }, console,
    setTimeout() {}, clearTimeout() {},
    localStorage: {
      getItem: (key) => (key in stored ? stored[key] : null),
      setItem: (key, value) => { stored[key] = String(value); },
      removeItem: (key) => { delete stored[key]; },
    },
    Pebble: {
      addEventListener: (name, handler) => { handlers[name] = handler; },
      sendAppMessage: (message) => { phoneMessage = message; },
      openURL() {},
    },
  });
  const response = {
    action: "save_settings", appearance: "auto",
    display: { horizontal: 2, vertical: 1, fontSize: 2, useDigits: true, textColor: 12, backgroundColor: 19 },
    zones: ["Australia/Sydney", "America/New_York", "Asia/Kolkata", "UTC"].map((timeZone, id) => ({
      id, enabled: id < 3, useDigits: id % 2 === 0, timeZone, label: `ZONE ${id}`,
      textColor: 12 + id, backgroundColor: 19 - id,
    })),
    slots: Array.from({ length: 4 }, (_, id) => ({ id, hour: 8 + id * 3, minute: 15 + id, enabled: id < 3 })),
  };
  handlers.webviewclosed({ response: encodeURIComponent(JSON.stringify(response)) });
  const pending = Object.values(stored).map((value) => {
    try { return JSON.parse(value); } catch { return null; }
  }).find((value) => value && value.pendingSettings);
  return { response, phoneMessage, fingerprints: pending.pendingSettings.zoneFingerprints };
}

test("native message types match the phone bridge", () => {
  const { MessageType } = require("../src/pkjs/settings.js");
  const header = fs.readFileSync(path.join(root, "src/c/app_types.h"), "utf8");
  const native = Object.fromEntries([...header.matchAll(/MESSAGE_TYPE_(\w+) = (\d+)/g)]
    .map(([, name, value]) => [name, Number(value)]));
  assert.deepEqual(native, MessageType);
});

test("native phone sync decodes, applies, and reports settings", async (t) => {
  const { response, phoneMessage, fingerprints } = phoneSettingsMessage();
  assert.equal(phoneMessage.TYPE, 8);
  const messageArgs = Object.entries(phoneMessage).flatMap(([key, value]) => {
    assert.notEqual(keys.indexOf(key), -1, `undeclared message key: ${key}`);
    return [String(keys.indexOf(key)), String(value)];
  });
  const messageBytes = 1 + Object.values(phoneMessage).reduce((size, value) =>
    size + 7 + (typeof value === "string" ? Buffer.byteLength(value) + 1 : 4), 0);
  assert.ok(messageBytes <= 1024, "phone dictionary fits native inbox");

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "number-watch-sync-"));
  try {
    const binary = compileSync(directory);
    const run = (scenario, args = messageArgs, env = {}) => childProcess.execFileSync(
      binary, [String(scenario), ...args],
      { encoding: "utf8", env: { ...process.env, TZ: "UTC", ...env } },
    ).trim();
    for (const [scenario, name, expected] of [
      [0, "settings saved during a sync receive a current confirmation", "1 0 0"],
      [1, "phone save refreshes the visible screen", "1"],
      [3, "synchronous outbox begin failure does not wedge sync", "0"],
      [4, "synchronous outbox send failure does not wedge sync", "0"],
      [5, "timezone refresh redraws the visible screen", "1"],
      [8, "integer tuples accept every Pebble width and labels are never truncated", "ok"],
      [9, "message types are read from integer tuples of any width", "ok"],
      [10, "requesting status during a background sync shows and completes the status screen", "1 1 0"],
    ]) {
      await t.test(name, () => assert.equal(run(scenario), expected));
    }
    await t.test("real phone dictionary round-trips through native decoder and snapshot", () => {
      const payload = run(6);
      const snapshot = JSON.parse(payload);
      assert.equal(snapshot.revision, 1);
      assert.deepEqual(snapshot.display, response.display);
      assert.deepEqual(snapshot.slots, response.slots);
      assert.deepEqual(snapshot.zones, response.zones.map(({ timeZone, ...zone }, index) => ({
        ...zone, timezoneFingerprint: fingerprints[index],
      })));
    });
    await t.test("worst-case payloads fit the outbox and overflow fails the sync", () => {
      const [snapshotLength, eventLength] = run(11, []).split(" ").map(Number);
      assert.ok(snapshotLength + 1 + 1 + 7 + 4 + 7 <= 1024, `snapshot ${snapshotLength} fits outbox`);
      assert.ok(eventLength + 1 + 1 + 7 + 4 + 7 <= 1024, `event ${eventLength} fits outbox`);
    });
    await t.test("events report the Home day and Home offset", () => {
      const named = JSON.parse(run(12, []));
      assert.equal(named.events[0].localDay, "2026-01-02");
      assert.equal(named.events[0].timezoneOffset, 660);
      assert.equal(named.events[0].outcome, "taken");
      assert.equal(named.events[0].answeredAt, 1767297660000);
      const local = JSON.parse(run(13, [], { TZ: "XYZ-10" }));
      assert.equal(local.events[0].localDay, "2026-01-02");
      assert.equal(local.events[0].timezoneOffset, 600);
      const west = JSON.parse(run(13, [], { TZ: "XYZ+5" }));
      assert.equal(west.events[0].localDay, "2026-01-01");
      assert.equal(west.events[0].timezoneOffset, -300);
    });
    await t.test("timezone labels preserve eight characters and reject invalid values without truncating", () => {
      for (let zone = 0; zone < 4; zone++) {
        const labelKey = String(keys.indexOf(`TZ_${zone}_LABEL`));
        for (const label of ["A", "ABCDEFGH", "SYD 1234", "", "ABCDEFGHI", "A".repeat(64), "SYD-NUM"]) {
          const args = [...messageArgs];
          for (let index = 0; index < args.length; index += 2) {
            if (args[index] === labelKey) args[index + 1] = label;
          }
          const valid = /^[A-Z0-9 ]{1,8}$/.test(label);
          const result = run(valid ? 6 : 7, args);
          if (valid) {
            const snapshot = JSON.parse(result);
            assert.equal(snapshot.revision, 1);
            assert.equal(snapshot.zones[zone].label, label);
          } else {
            assert.equal(result, "0", `zone ${zone} must reject ${JSON.stringify(label)}`);
          }
        }
      }
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
