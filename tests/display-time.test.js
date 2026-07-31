const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("native display time applies fixed UTC offsets", () => {
  const root = path.resolve(__dirname, "..");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "number-watch-time-"));
  const binary = path.join(directory, "display-time-test");

  try {
    childProcess.execFileSync(
      "cc",
      [
        "-std=c11",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-Isrc/c",
        "src/c/display_time.c",
        "tests/display_time_test.c",
        "-o",
        binary,
      ],
      { cwd: root, stdio: "pipe" },
    );
    assert.doesNotThrow(() => childProcess.execFileSync(binary));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
