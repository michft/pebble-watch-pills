const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const compiler = process.env.CC ?? "cc";
const flags = ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-Itests/host", "-Isrc/c"];

function runHarness(name, sources, env = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "number-watch-state-"));
  const binary = path.join(directory, name);
  try {
    childProcess.execFileSync(compiler, [
      ...flags, ...sources, "tests/host/pebble_fake.c", `tests/${name}.c`, "-o", binary,
    ], { cwd: root, stdio: "pipe" });
    return childProcess.execFileSync(binary, {
      encoding: "utf8", env: { ...process.env, ...env },
    }).trim();
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("reminder state survives corrupt history and migrates version 2 storage", () => {
  assert.equal(runHarness("persist_state_test", ["src/c/persist_state.c"]), "ok");
});

test("scheduler skips the Home day already recorded for a slot", () => {
  assert.equal(runHarness("scheduler_test", [
    "src/c/scheduler.c", "src/c/persist_state.c", "src/c/display_settings.c", "src/c/display_time.c",
  ], { TZ: "UTC" }), "ok");
});
