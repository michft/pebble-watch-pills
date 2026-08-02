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

test("native reminder navigation initializes editing state", () => {
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

test("watch navigation uses Up and Down without Select or Back conflicts", () => {
  const source = fs.readFileSync(path.join(root, "src/c/main.c"), "utf8");

  assert.match(source, /static Screen s_screen = SCREEN_WATCHFACE/);
  assert.match(source, /s_screen == SCREEN_WATCHFACE[\s\S]+cycle_active_timezone\(-1\)/);
  assert.match(source, /s_screen == SCREEN_WATCHFACE[\s\S]+cycle_active_timezone\(1\)/);
  assert.match(source, /window_long_click_subscribe\(BUTTON_ID_UP/);
  assert.match(source, /window_long_click_subscribe\(BUTTON_ID_DOWN/);
  assert.doesNotMatch(source, /click_subscribe\(BUTTON_ID_SELECT/);
  assert.doesNotMatch(source, /click_subscribe\(BUTTON_ID_BACK/);
  assert.match(source, /s_screen == SCREEN_ALERT[\s\S]+REMINDER_ALERT_BUTTON_UP/);
  assert.match(source, /s_screen == SCREEN_ALERT[\s\S]+REMINDER_ALERT_BUTTON_DOWN/);
  assert.match(source, /type->value->int32 == 9[\s\S]+read_timezone_settings/);
});
