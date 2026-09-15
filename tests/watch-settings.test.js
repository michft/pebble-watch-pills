const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("digit persistence failures cannot confirm an unsaved setting", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src/c/main.c"), "utf8");
  const keys = require("../package.json").pebble.messageKeys;
  function extract(pattern) {
    const match = source.match(pattern);
    assert.ok(match, `missing native declaration: ${pattern}`);
    return match[0];
  }
  function handler(name) {
    return extract(new RegExp(`^static (?:void|int) ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\}`, "m"));
  }
  // Compile the real persistence, inbox, and snapshot functions with SDK I/O stubs.
  const harness = `
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
${["SLOT_COUNT", "TIMEZONE_COUNT", "TIMEZONE_LABEL_LENGTH", "COLOR_ID_MAX",
    "PERSIST_KEY_DISPLAY_SETTINGS", "PERSIST_KEY_USE_DIGITS"]
    .map((name) => extract(new RegExp(`^#define ${name} .+$`, "m"))).join("\n")}
#define ARRAY_LENGTH(a) (sizeof(a) / sizeof((a)[0]))
#define APP_LOG(...) ((void)0)
#define SCREEN_WATCHFACE 0
enum { ${keys.map((key) => `MESSAGE_KEY_${key}`).join(", ")}, KEY_COUNT };
typedef int WakeupId;
typedef long time_t;
${["TimezoneSettings", "DisplaySettings", "ReminderSlot"]
    .map((name) => extract(new RegExp(`typedef struct \\{[^}]*\\} ${name};`))).join("\n")}
typedef struct { int32_t int32; } TupleValue;
typedef struct { TupleValue *value; } Tuple;
typedef struct { TupleValue values[KEY_COUNT]; Tuple tuples[KEY_COUNT]; } DictionaryIterator;
static DisplaySettings s_display_settings;
static bool s_use_digits;
static int s_screen = SCREEN_WATCHFACE;
static void *s_timezone_feedback_timer;
static uint8_t s_active_timezone;
static struct {
  ReminderSlot slots[SLOT_COUNT];
  uint32_t settings_revision, install_id;
  uint16_t dropped_events;
} s_state;
static bool persisted_digits, displayed_digits;
static int write_status;
static char snapshot[1024];
static Tuple *dict_find(DictionaryIterator *iterator, uint32_t key) {
  iterator->tuples[key].value = &iterator->values[key];
  return &iterator->tuples[key];
}
static int persist_write_bool(uint32_t key, bool value) {
  assert(key == PERSIST_KEY_USE_DIGITS);
  if (write_status >= 0) persisted_digits = value;
  return write_status;
}
static bool persist_read_bool(uint32_t key) {
  assert(key == PERSIST_KEY_USE_DIGITS);
  return persisted_digits;
}
static int persist_write_data(uint32_t key, const void *value, size_t size) {
  assert(key == PERSIST_KEY_DISPLAY_SETTINGS);
  assert(value == &s_display_settings);
  return (int)size;
}
static bool read_timezone_settings(DictionaryIterator *iterator, DisplaySettings *settings) {
  (void)iterator; (void)settings;
  return true;
}
static bool times_too_close(ReminderSlot *slots) { (void)slots; return false; }
static void start_sync(bool show) { (void)show; }
static void schedule_next(void) {}
static void update_watchface(void) { displayed_digits = s_use_digits; }
static bool clock_is_24h_style(void) { return true; }
static uint32_t timezone_state_fingerprint(const TimezoneSettings *zone) {
  (void)zone; return 0;
}
static void send_payload(int type, const char *payload) {
  assert(type == 5);
  snprintf(snapshot, sizeof(snapshot), "%s", payload);
}
${handler("save_display_settings")}
${handler("send_settings_snapshot")}
${handler("inbox_received")}
int main(int argc, char **argv) {
  assert(argc == 4);
  persisted_digits = atoi(argv[1]) != 0;
  s_use_digits = persist_read_bool(PERSIST_KEY_USE_DIGITS);
  write_status = atoi(argv[3]);
  DictionaryIterator iterator = {0};
  iterator.values[MESSAGE_KEY_TYPE].int32 = 8;
  iterator.values[MESSAGE_KEY_USE_DIGITS].int32 = atoi(argv[2]);
  inbox_received(&iterator, NULL);
  puts(snapshot);
  printf("%d %d %d\\n", s_use_digits, displayed_digits, persisted_digits);
}
`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "number-watch-settings-"));
  const input = path.join(directory, "settings-test.c");
  const binary = path.join(directory, "settings-test");
  try {
    fs.writeFileSync(input, harness);
    childProcess.execFileSync("cc", [
      "-std=c11", "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter",
      input, "-o", binary,
    ], { stdio: "pipe" });
    for (const previous of [false, true]) {
      for (const status of [-1, 1]) {
        const requested = !previous;
        const expected = status < 0 ? previous : requested;
        const [payload, values] = childProcess.execFileSync(binary, [
          String(Number(previous)), String(Number(requested)), String(status),
        ], { encoding: "utf8" }).trim().split("\n");
        assert.equal(JSON.parse(payload).display.useDigits, expected,
          `snapshot after ${previous} -> ${requested}, persistence status ${status}`);
        assert.deepEqual(values.split(" ").map(Number), Array(3).fill(Number(expected)),
          "memory, rendered mode, and persisted mode must agree");
      }
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
