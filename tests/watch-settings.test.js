const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("per-timezone modes migrate, persist, reject invalid values, and report write failures", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src/c/main.c"), "utf8");
  const keys = require("../package.json").pebble.messageKeys;
  function extract(pattern) {
    const match = source.match(pattern);
    assert.ok(match, `missing native declaration: ${pattern}`);
    return match[0];
  }
  function handler(name) {
    return extract(new RegExp(`^static (?:void|int|bool|uint8_t) ${name}\\([^\\n]*\\) \\{[\\s\\S]*?^\\}`, "m"));
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
    "PERSIST_KEY_DISPLAY_SETTINGS", "PERSIST_KEY_USE_DIGITS", "PERSIST_KEY_TZ_DIGITS_MASK"]
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
static uint8_t s_digits_mask;
static int s_screen = SCREEN_WATCHFACE;
static void *s_timezone_feedback_timer;
static uint8_t s_active_timezone;
static struct {
  ReminderSlot slots[SLOT_COUNT];
  uint32_t settings_revision, install_id;
  uint16_t dropped_events;
} s_state;
static bool legacy_digits, mask_exists;
static uint8_t persisted_mask;
static int requested_mask;
static int write_status;
static char snapshot[1024];
static Tuple *dict_find(DictionaryIterator *iterator, uint32_t key) {
  if (key == MESSAGE_KEY_TZ_DIGITS_MASK && requested_mask == -2) return NULL;
  iterator->tuples[key].value = &iterator->values[key];
  return &iterator->tuples[key];
}
static int persist_write_int(uint32_t key, int32_t value) {
  assert(key == PERSIST_KEY_TZ_DIGITS_MASK);
  if (write_status >= 0) { persisted_mask = value; mask_exists = true; }
  return write_status;
}
static int32_t persist_read_int(uint32_t key) {
  assert(key == PERSIST_KEY_TZ_DIGITS_MASK);
  return persisted_mask;
}
static bool persist_exists(uint32_t key) {
  assert(key == PERSIST_KEY_TZ_DIGITS_MASK);
  return mask_exists;
}
static bool persist_read_bool(uint32_t key) {
  assert(key == PERSIST_KEY_USE_DIGITS);
  return legacy_digits;
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
static void update_watchface(void) {}
static bool clock_is_24h_style(void) { return true; }
static uint32_t timezone_state_fingerprint(const TimezoneSettings *zone) {
  (void)zone; return UINT32_MAX;
}
static void send_payload(int type, const char *payload) {
  assert(type == 5);
  snprintf(snapshot, sizeof(snapshot), "%s", payload);
}
${handler("load_digits_mask")}
${handler("timezone_uses_digits")}
${handler("save_display_settings")}
${handler("send_settings_snapshot")}
${handler("inbox_received")}
int main(int argc, char **argv) {
  assert(argc == 6);
  int previous = atoi(argv[1]);
  mask_exists = previous >= 0;
  legacy_digits = previous == -1;
  persisted_mask = previous >= 0 ? previous : 0;
  s_digits_mask = load_digits_mask();
  requested_mask = atoi(argv[2]);
  write_status = atoi(argv[3]);
  s_state.install_id = UINT32_MAX;
  s_state.settings_revision = UINT32_MAX - 1;
  s_state.dropped_events = UINT16_MAX;
  for (int i = 0; i < TIMEZONE_COUNT; i++) {
    snprintf(s_display_settings.zones[i].label, TIMEZONE_LABEL_LENGTH + 1, "ABCDEFGH");
    s_display_settings.zones[i].text_color = COLOR_ID_MAX;
    s_display_settings.zones[i].background_color = COLOR_ID_MAX;
  }
  s_display_settings.text_color = COLOR_ID_MAX;
  s_display_settings.background_color = COLOR_ID_MAX;
  for (int i = 0; i < SLOT_COUNT; i++) {
    s_state.slots[i].hour = 23;
    s_state.slots[i].minute = 59;
  }
  DictionaryIterator iterator = {0};
  iterator.values[MESSAGE_KEY_TYPE].int32 = atoi(argv[5]);
  iterator.values[MESSAGE_KEY_TZ_DIGITS_MASK].int32 = requested_mask;
  iterator.values[MESSAGE_KEY_USE_DIGITS].int32 = atoi(argv[4]);
  const uint32_t hour_keys[] = { MESSAGE_KEY_SLOT_0_HOUR, MESSAGE_KEY_SLOT_1_HOUR,
    MESSAGE_KEY_SLOT_2_HOUR, MESSAGE_KEY_SLOT_3_HOUR };
  const uint32_t minute_keys[] = { MESSAGE_KEY_SLOT_0_MINUTE, MESSAGE_KEY_SLOT_1_MINUTE,
    MESSAGE_KEY_SLOT_2_MINUTE, MESSAGE_KEY_SLOT_3_MINUTE };
  iterator.values[MESSAGE_KEY_TEXT_COLOR].int32 = COLOR_ID_MAX;
  iterator.values[MESSAGE_KEY_BACKGROUND_COLOR].int32 = COLOR_ID_MAX;
  for (int i = 0; i < SLOT_COUNT; i++) {
    iterator.values[hour_keys[i]].int32 = 23;
    iterator.values[minute_keys[i]].int32 = 59;
  }
  inbox_received(&iterator, NULL);
  send_settings_snapshot();
  puts(snapshot);
  printf("%u %u", s_digits_mask, load_digits_mask());
  for (int i = 0; i < TIMEZONE_COUNT; i++) printf(" %d", timezone_uses_digits(i));
  puts("");
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
    for (const previous of [-2, -1, 0, 2, 15]) {
      for (const status of [-1, 4]) {
        for (const requested of [-2, -1, 0, 2, 15, 16]) {
          for (const legacy of [0, 1]) {
            for (const type of [8, 9]) {
              const before = previous === -1 ? 15 : previous < 0 ? 0 : previous;
              const expected = type === 9 || status < 0 || requested === -1 || requested === 16
                ? before : requested === -2 ? legacy ? 15 : 0 : requested;
              const [payload, values] = childProcess.execFileSync(binary, [
                previous, requested, status, legacy, type,
              ].map(String), { encoding: "utf8" }).trim().split("\n");
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
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
