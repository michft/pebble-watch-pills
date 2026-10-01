const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("native settings delivery survives sync overlap and refreshes visible lists", async (t) => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "src/c/main.c"), "utf8");
  const keys = require("../package.json").pebble.messageKeys;
  const handlers = {};
  let stored = null;
  let phoneMessage;
  const bridgePath = path.join(root, "src/pkjs/index.js");
  vm.runInNewContext(fs.readFileSync(bridgePath, "utf8"), {
    require: require("node:module").createRequire(bridgePath), exports: {}, console,
    setTimeout() {}, clearTimeout() {},
    localStorage: { getItem: () => stored, setItem: (key, value) => { stored = value; } },
    Pebble: {
      addEventListener: (name, handler) => { handlers[name] = handler; },
      sendAppMessage: (message) => { phoneMessage = message; },
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
  assert.equal(phoneMessage.TYPE, 8);
  const messageArgs = Object.entries(phoneMessage).flatMap(([key, value]) => {
    assert.notEqual(keys.indexOf(key), -1, `undeclared message key: ${key}`);
    return [String(keys.indexOf(key)), String(value)];
  });
  const messageBytes = 1 + Object.values(phoneMessage).reduce((size, value) =>
    size + 7 + (typeof value === "string" ? Buffer.byteLength(value) + 1 : 4), 0);
  assert.ok(messageBytes <= 1024, "phone dictionary fits native inbox");
  function declaration(pattern) {
    const match = source.match(pattern);
    assert.ok(match, `missing native declaration: ${pattern}`);
    return match[0];
  }
  function handler(name) {
    return declaration(new RegExp(`^static (?:void|bool|uint32_t) ${name}\\([^;]*?\\) \\{[\\s\\S]*?^\\}`, "m"));
  }
  const harness = `
#include <assert.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#define SLOT_COUNT 4
#define TIMEZONE_COUNT 4
#define TIMEZONE_LABEL_LENGTH 8
#define COLOR_ID_MAX 19
#define ARRAY_LENGTH(a) (sizeof(a) / sizeof((a)[0]))
#define APP_MSG_OK 0
#define APP_MSG_BUSY 1
#define APP_LOG(...) ((void)0)
#include "display_time.h"
#define TUPLE_CSTRING 1
enum { SCREEN_WATCHFACE, SCREEN_MAIN, SCREEN_TIMEZONES, SCREEN_SYNC };
enum { OUTCOME_TAKEN, OUTCOME_SKIPPED };
enum { ${keys.map((key) => `MESSAGE_KEY_${key}`).join(", ")}, KEY_COUNT };
typedef int AppMessageResult;
typedef int WakeupId;
${["TimezoneSettings", "DisplaySettings", "ReminderSlot", "ReminderEvent"]
    .map((name) => declaration(new RegExp(`typedef struct \\{[^}]*\\} ${name};`))).join("\n")}
typedef union { int32_t int32; char cstring[65]; } TupleValue;
typedef struct { TupleValue *value; int type; } Tuple;
typedef struct { TupleValue values[KEY_COUNT]; Tuple tuples[KEY_COUNT]; bool present[KEY_COUNT]; } DictionaryIterator;
static struct {
  uint32_t install_id, settings_revision;
  uint16_t dropped_events, event_count;
  ReminderSlot slots[SLOT_COUNT];
  ReminderEvent events[1];
} s_state;
static DisplaySettings s_display_settings;
static uint8_t s_digits_mask, s_active_timezone;
static int s_screen;
static void *s_timezone_feedback_timer;
${source.match(/^static (?:bool|uint16_t) s_sync\w*;/gm).join("\n")}
static char s_footer_text[64], s_header_text[32];
static bool busy, fail_begin, fail_send;
static int pending_type, message_type, sent_snapshots, latest_revision = -1;
static int main_redraws, timezone_redraws, watchface_redraws;
static DictionaryIterator outbox;
static DictionaryIterator incoming;
static char payload[1024], snapshot[1024];
static void send_sync_item(void);
static void send_settings_snapshot(void);
static void set_footer_text(void) {}
static void set_header_text(void) {}
static void show_home(void) {}
static void show_reminder_layers(void) {}
static void layout_detail_rows(void) {}
static void set_row(int row, bool selected, const char *label, const char *value) {}
static void show_main(const char *note) { main_redraws++; }
static void show_timezones(void) { timezone_redraws++; }
static void update_watchface(void) { watchface_redraws++; }
static int app_message_outbox_begin(DictionaryIterator **iterator) {
  if (busy || fail_begin) return APP_MSG_BUSY;
  *iterator = &outbox;
  return APP_MSG_OK;
}
static int dict_write_int32(DictionaryIterator *iterator, uint32_t key, int32_t value) {
  message_type = value;
  return 0;
}
static int dict_write_cstring(DictionaryIterator *iterator, uint32_t key, const char *value) {
  snprintf(payload, sizeof(payload), "%s", value);
  return 0;
}
static int app_message_outbox_send(void) {
  if (fail_send) return APP_MSG_BUSY;
  busy = true;
  pending_type = message_type;
  if (message_type == 5) {
    sent_snapshots++;
    latest_revision = s_state.settings_revision;
    snprintf(snapshot, sizeof(snapshot), "%s", payload);
  }
  return APP_MSG_OK;
}
static Tuple *dict_find(DictionaryIterator *iterator, uint32_t key) {
  if (!iterator->present[key]) return NULL;
  iterator->tuples[key].value = &iterator->values[key];
  return &iterator->tuples[key];
}
${handler("timezone_label_valid")}
${handler("read_timezone_settings")}
${handler("times_too_close")}
static int save_display_settings(void) { return 0; }
static uint8_t load_digits_mask(void) { return 0; }
static void schedule_next(void) {}
${handler("outbox_sent")}
${handler("outbox_failed")}
${handler("send_payload")}
static bool clock_is_24h_style(void) { return true; }
${handler("timezone_uses_digits")}
${handler("timezone_state_fingerprint")}
${handler("send_settings_snapshot")}
${handler("send_sync_item")}
${handler("start_sync")}
${handler("inbox_received")}
static void deliver(int type) {
  incoming.values[MESSAGE_KEY_TYPE].int32 = type;
  inbox_received(&incoming, NULL);
}
int main(int argc, char **argv) {
  assert(argc >= 2);
  for (int i = 2; i < argc; i += 2) {
    int key = atoi(argv[i]);
    incoming.present[key] = true;
    if (key == MESSAGE_KEY_TZ_0_LABEL || key == MESSAGE_KEY_TZ_1_LABEL
        || key == MESSAGE_KEY_TZ_2_LABEL || key == MESSAGE_KEY_TZ_3_LABEL) {
      incoming.tuples[key].type = TUPLE_CSTRING;
      snprintf(incoming.values[key].cstring, sizeof(incoming.values[key].cstring), "%s", argv[i + 1]);
    } else incoming.values[key].int32 = (int32_t)strtol(argv[i + 1], NULL, 10);
  }
  int scenario = atoi(argv[1]);
  if (scenario == 0) {
    start_sync(false);
    assert(busy && pending_type == 5);
    deliver(8);
    deliver(7);
    for (int i = 0; busy && i < 20; i++) {
      busy = false;
      outbox_sent(&outbox, NULL);
    }
    printf("%d %d %d\\n", latest_revision, s_syncing, busy);
  } else if (scenario == 1 || scenario == 2) {
    s_screen = scenario == 1 ? SCREEN_MAIN : SCREEN_TIMEZONES;
    deliver(8);
    printf("%d\\n", scenario == 1 ? main_redraws : timezone_redraws);
  } else if (scenario == 3 || scenario == 4) {
    fail_begin = scenario == 3;
    fail_send = scenario == 4;
    start_sync(false);
    printf("%d\\n", s_syncing);
  } else if (scenario == 5) {
    s_screen = SCREEN_TIMEZONES;
    deliver(9);
    printf("%d\\n", timezone_redraws);
  } else if (scenario == 6) {
    deliver(8);
    puts(snapshot);
  }
}
`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "number-watch-sync-"));
  const input = path.join(directory, "sync-test.c");
  const binary = path.join(directory, "sync-test");
  try {
    fs.writeFileSync(input, harness);
    childProcess.execFileSync("cc", [
      "-std=c11", "-Wall", "-Wextra", "-Werror", "-Wno-unused-parameter", "-Wno-unused-function",
      "-I", path.join(root, "src/c"), input, "-o", binary,
    ], { stdio: "pipe" });
    for (const [scenario, name, expected] of [
      [0, "settings saved during a sync receive a current confirmation", "1 0 0"],
      [1, "phone save refreshes the visible reminders list", "1"],
      [2, "phone save refreshes the visible timezone list", "1"],
      [3, "synchronous outbox begin failure does not wedge sync", "0"],
      [4, "synchronous outbox send failure does not wedge sync", "0"],
      [5, "timezone refresh redraws the visible timezone list", "1"],
    ]) {
      await t.test(name, () => {
        const result = childProcess.execFileSync(binary, [String(scenario), ...messageArgs], { encoding: "utf8" });
        assert.equal(result.trim(), expected);
      });
    }
    await t.test("real phone dictionary round-trips through native decoder and snapshot", () => {
      const payload = childProcess.execFileSync(binary, ["6", ...messageArgs], { encoding: "utf8" }).trim();
      const snapshot = JSON.parse(payload);
      assert.equal(snapshot.revision, 1);
      assert.deepEqual(snapshot.display, response.display);
      assert.deepEqual(snapshot.slots, response.slots);
      assert.deepEqual(snapshot.zones, response.zones.map(({ timeZone, ...zone }, index) => ({
        ...zone, timezoneFingerprint: JSON.parse(stored).pendingSettings.zoneFingerprints[index],
      })));
      assert.ok(Buffer.byteLength(payload) + 20 <= 1024, "snapshot dictionary fits native outbox");
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
