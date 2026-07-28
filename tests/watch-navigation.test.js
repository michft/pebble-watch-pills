const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("ships Number Watch as a button-capable watchapp", () => {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  );

  assert.equal(packageJson.pebble.watchapp.watchface, false);
});

test("native Select navigation initializes reminder editing state", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "number-watch-nav-"));
  const binary = path.join(directory, "watch-navigation-test");

  try {
    childProcess.execFileSync(
      "cc",
      [
        "-std=c11",
        "-Wall",
        "-Wextra",
        "-Werror",
        "-Isrc/c",
        "src/c/reminder_navigation.c",
        "tests/reminder_navigation_test.c",
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
