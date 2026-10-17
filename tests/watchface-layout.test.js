const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("watchface enlarges digits and restores text fonts for words, labels, and errors", () => {
  const root = path.resolve(__dirname, "..");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "number-watch-layout-"));
  const binary = path.join(directory, "layout");
  try {
    childProcess.execFileSync(process.env.CC ?? "cc", [
      "-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-Itests/host", "-Isrc/c",
      "src/c/watchface.c", "src/c/display_settings.c", "src/c/display_time.c", "src/c/time_words.c",
      "tests/host/pebble_fake.c", "tests/watchface_layout_test.c", "-o", binary,
    ], { cwd: root, stdio: "pipe" });
    assert.equal(childProcess.execFileSync(binary, {
      encoding: "utf8", env: { ...process.env, TZ: "UTC" },
    }).trim(), "ok");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
