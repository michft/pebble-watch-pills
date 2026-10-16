const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const compiler = process.env.CC ?? "cc";
const flags = ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror"];
const keys = require("../package.json").pebble.messageKeys;

function withHarness(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "number-watch-settings-"));
  try {
    const keyFile = path.join(directory, "message_keys.c");
    fs.writeFileSync(keyFile, "#include <stdint.h>\n"
      + keys.map((key, index) => `uint32_t MESSAGE_KEY_${key} = ${index};`).join("\n") + "\n");
    const binary = path.join(directory, "settings-test");
    childProcess.execFileSync(compiler, [
      ...flags, "-Itests/host", "-Isrc/c",
      "src/c/display_settings.c", "src/c/phone_sync.c", "src/c/persist_state.c",
      "src/c/scheduler.c", "src/c/display_time.c",
      "tests/host/pebble_fake.c", "tests/watch_settings_test.c", keyFile, "-o", binary,
    ], { cwd: root, stdio: "pipe" });
    callback((args) => childProcess.execFileSync(binary, args.map(String), {
      encoding: "utf8", env: { ...process.env, TZ: "UTC" },
    }).trim());
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("display settings migrate V1-V3, reject corrupt or wrong-size blobs, and report save failures", () => {
  withHarness((run) => assert.equal(run(["migrate"]), "ok"));
});

test("per-timezone modes migrate, persist, reject invalid values, and report write failures", () => {
  withHarness((run) => {
    for (const previous of [-2, -1, 0, 2, 15]) {
      for (const status of [-1, 4]) {
        for (const requested of [-2, -1, 0, 2, 15, 16]) {
          for (const legacy of [0, 1]) {
            for (const type of [8, 9]) {
              const before = previous === -1 ? 15 : previous < 0 ? 0 : previous;
              const expected = type === 9 || status < 0 || requested === -1 || requested === 16
                ? before : requested === -2 ? legacy ? 15 : 0 : requested;
              const [payload, values] = run(["digits", previous, requested, status, legacy, type]).split("\n");
              const snapshot = JSON.parse(payload);
              const modes = Array.from({ length: 4 }, (_, index) => Boolean(expected & (1 << index)));
              assert.equal(snapshot.display.useDigits, modes[0]);
              assert.deepEqual(snapshot.zones.map((zone) => zone.useDigits), modes);
              assert.deepEqual(values.split(" ").map(Number), [expected, expected, ...modes.map(Number)],
                `memory, restart, selection: previous=${previous} requested=${requested} status=${status} type=${type}`);
              assert.ok(Buffer.byteLength(payload) + 20 <= 1024, "snapshot plus dictionary overhead fits outbox");
            }
          }
        }
      }
    }
  });
});
