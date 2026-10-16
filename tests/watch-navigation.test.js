const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const compiler = process.env.CC ?? "cc";
const flags = ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror"];

function completeHandler(source, name) {
  const match = source.match(new RegExp(
    "^(?:static )?void " + name + "\\([^\\n]*\\) \\{[\\s\\S]*?^\\}",
    "m",
  ));
  assert.ok(match, "missing complete " + name + " handler");
  return match[0];
}

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
      compiler,
      [
        ...flags,
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

test("every native module compiles against the host SDK stub", () => {
  const sources = fs.readdirSync(path.join(root, "src/c"))
    .filter((name) => name.endsWith(".c"))
    .map((name) => path.join("src/c", name));
  assert.ok(sources.includes("src/c/ui.c") && sources.includes("src/c/main.c"));
  for (const source of sources) {
    childProcess.execFileSync(compiler, [
      ...flags, "-fsyntax-only", "-Itests/host", "-Isrc/c", source,
    ], { cwd: root, stdio: "pipe" });
  }
});

test("watch navigation uses Up and Down without Select or Back conflicts", () => {
  const source = fs.readFileSync(path.join(root, "src/c/ui.c"), "utf8");
  const sync = fs.readFileSync(path.join(root, "src/c/phone_sync.c"), "utf8");
  const scheduler = fs.readFileSync(path.join(root, "src/c/scheduler.c"), "utf8");
  const upHandler = completeHandler(source, "up_click");
  const downHandler = completeHandler(source, "down_click");
  const timezoneHandler = completeHandler(sync, "apply_timezone_update");
  const scheduleHandler = completeHandler(scheduler, "scheduler_schedule_next");

  assert.match(source, /\.screen = SCREEN_WATCHFACE/);
  assert.match(upHandler, /SCREEN_WATCHFACE[\s\S]+watchface_cycle_timezone\(-1\)/);
  assert.match(downHandler, /SCREEN_WATCHFACE[\s\S]+watchface_cycle_timezone\(1\)/);
  assert.match(source, /window_long_click_subscribe\(BUTTON_ID_UP/);
  assert.match(source, /window_long_click_subscribe\(BUTTON_ID_DOWN/);
  assert.doesNotMatch(source, /click_subscribe\(BUTTON_ID_SELECT/);
  assert.doesNotMatch(source, /click_subscribe\(BUTTON_ID_BACK/);
  assert.match(upHandler, /SCREEN_ALERT[\s\S]+REMINDER_ALERT_BUTTON_UP/);
  assert.match(downHandler, /SCREEN_ALERT[\s\S]+REMINDER_ALERT_BUTTON_DOWN/);
  assert.match(sync, /case MESSAGE_TYPE_TIMEZONE_UPDATE:\s+apply_timezone_update/);
  assert.match(timezoneHandler, /read_timezone_settings[\s\S]+display_settings_save\(\);[\s\S]+scheduler_schedule_next\(\);/);
  assert.match(scheduleHandler, /slot->enabled[\s\S]+slot->scheduled_at[\s\S]+earliest/);
});
