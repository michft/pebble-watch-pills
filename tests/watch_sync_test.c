/* Drives the real phone_sync module against in-memory Pebble fakes. */
#include "pebble_fake.h"

#include <assert.h>

#include "display_settings.h"
#include "display_time.h"
#include "persist_state.h"
#include "phone_sync.h"
#include "scheduler.h"
#include "ui.h"

extern uint32_t MESSAGE_KEY_TYPE;
extern uint32_t MESSAGE_KEY_TZ_0_LABEL;
extern uint32_t MESSAGE_KEY_TZ_1_LABEL;
extern uint32_t MESSAGE_KEY_TZ_2_LABEL;
extern uint32_t MESSAGE_KEY_TZ_3_LABEL;

static int status_shows, status_failures, status_done, settings_changes, timezone_changes;

void ui_sync_status_show(void) { status_shows++; }
void ui_sync_status_failed(void) { status_failures++; }
void ui_sync_status_done(void) { status_done++; }
void ui_settings_changed(void) { settings_changes++; }
void ui_timezones_changed(void) { timezone_changes++; }

static DictionaryIterator incoming;

static void deliver(int32_t type) {
  fake_dict_put_int(&incoming, MESSAGE_KEY_TYPE, TUPLE_INT, 4, type);
  phone_sync_inbox_received(&incoming, NULL);
}

static const FakeOutboxMessage *last_message(int32_t type) {
  for (int i = fake_outbox_count - 1; i >= 0; i--) {
    if (fake_outbox_messages[i].type == type) return &fake_outbox_messages[i];
  }
  return NULL;
}

static long latest_revision(void) {
  const FakeOutboxMessage *snapshot = last_message(MESSAGE_TYPE_SETTINGS_SNAPSHOT);
  if (!snapshot) return -1;
  const char *revision = strstr(snapshot->payload, "\"revision\":");
  assert(revision);
  return strtol(revision + strlen("\"revision\":"), NULL, 10);
}

/** Acknowledges in-flight messages until the sync stops sending. */
static void drain(void) {
  for (int i = 0; fake_outbox_busy && i < 400; i++) {
    fake_outbox_busy = false;
    phone_sync_outbox_sent(&fake_outbox, NULL);
  }
}

static bool is_label_key(uint32_t key) {
  return key == MESSAGE_KEY_TZ_0_LABEL || key == MESSAGE_KEY_TZ_1_LABEL
    || key == MESSAGE_KEY_TZ_2_LABEL || key == MESSAGE_KEY_TZ_3_LABEL;
}

static void expect_tuple_int(TupleType type, uint16_t width, int64_t stored, bool ok, int32_t expected) {
  DictionaryIterator dict;
  fake_dict_clear(&dict);
  fake_dict_put_int(&dict, 1, type, width, stored);
  int32_t value = 12345;
  assert(tuple_int(dict_find(&dict, 1), &value) == ok);
  assert(value == (ok ? expected : 12345));
}

static void scenario_tuples(void) {
  expect_tuple_int(TUPLE_INT, 1, -5, true, -5);
  expect_tuple_int(TUPLE_INT, 2, -300, true, -300);
  expect_tuple_int(TUPLE_INT, 4, -100000, true, -100000);
  expect_tuple_int(TUPLE_UINT, 1, 200, true, 200);
  expect_tuple_int(TUPLE_UINT, 2, 60000, true, 60000);
  expect_tuple_int(TUPLE_UINT, 4, INT32_MAX, true, INT32_MAX);
  expect_tuple_int(TUPLE_UINT, 4, (int64_t)INT32_MAX + 1, false, 0);
  expect_tuple_int(TUPLE_INT, 3, 1, false, 0);
  expect_tuple_int(TUPLE_INT, 8, 1, false, 0);
  expect_tuple_int(TUPLE_BYTE_ARRAY, 4, 1, false, 0);
  int32_t value = 0;
  assert(!tuple_int(NULL, &value));

  DictionaryIterator dict;
  fake_dict_clear(&dict);
  fake_dict_put_cstring(&dict, 2, "7");
  assert(!tuple_int(dict_find(&dict, 2), &value));

  char label[TIMEZONE_LABEL_LENGTH + 1] = "KEEP";
  fake_dict_put_cstring(&dict, 3, "ABCDEFGH");
  assert(tuple_label(dict_find(&dict, 3), label) && strcmp(label, "ABCDEFGH") == 0);
  fake_dict_put_cstring(&dict, 3, "ABCDEFGHI");
  assert(!tuple_label(dict_find(&dict, 3), label) && strcmp(label, "ABCDEFGH") == 0);
  fake_dict_put_raw(&dict, 3, "SYD", 3);
  assert(!tuple_label(dict_find(&dict, 3), label));
  fake_dict_put_raw(&dict, 3, "", 0);
  assert(!tuple_label(dict_find(&dict, 3), label));
  fake_dict_put_int(&dict, 3, TUPLE_INT, 4, 0);
  assert(!tuple_label(dict_find(&dict, 3), label));
  assert(strcmp(label, "ABCDEFGH") == 0);
}

/** Integer message types of any width are honoured; others are ignored. */
static void scenario_message_types(void) {
  DictionaryIterator dict;
  fake_dict_clear(&dict);
  fake_dict_put_cstring(&dict, MESSAGE_KEY_TYPE, "7");
  phone_sync_inbox_received(&dict, NULL);
  assert(!phone_sync_running() && fake_outbox_count == 0);
  const int32_t ignored[] = {MESSAGE_TYPE_EVENT_BATCH, MESSAGE_TYPE_SETTINGS_SNAPSHOT,
    MESSAGE_TYPE_SYNC_DONE, 0, 99};
  for (size_t i = 0; i < ARRAY_LENGTH(ignored); i++) {
    fake_dict_put_int(&dict, MESSAGE_KEY_TYPE, TUPLE_INT, 4, ignored[i]);
    phone_sync_inbox_received(&dict, NULL);
    assert(!phone_sync_running() && fake_outbox_count == 0);
  }
  fake_dict_put_int(&dict, MESSAGE_KEY_TYPE, TUPLE_UINT, 1, MESSAGE_TYPE_REQUEST_SYNC);
  phone_sync_inbox_received(&dict, NULL);
  assert(phone_sync_running() && fake_outbox_count == 1);
  assert(fake_outbox_messages[0].type == MESSAGE_TYPE_SETTINGS_SNAPSHOT);
  drain();
  assert(!phone_sync_running());
  assert(fake_outbox_messages[fake_outbox_count - 1].type == MESSAGE_TYPE_SYNC_DONE);
  // A timezone update missing its zone tuples is rejected without side effects.
  fake_dict_put_int(&dict, MESSAGE_KEY_TYPE, TUPLE_INT, 2, MESSAGE_TYPE_TIMEZONE_UPDATE);
  phone_sync_inbox_received(&dict, NULL);
  assert(timezone_changes == 0);
}

/** Asking for status while a background sync runs shows the status screen. */
static void scenario_status_restart(void) {
  phone_sync_start(false);
  assert(status_shows == 0 && fake_outbox_busy);
  phone_sync_start(true);
  assert(status_shows == 1);
  drain();
  printf("%d %d %d\n", status_shows, status_done, phone_sync_running());
}

static void fill_worst_case_settings(void) {
  AppState *state = app_state();
  DisplaySettings *display = display_settings();
  state->install_id = UINT32_MAX;
  state->settings_revision = UINT32_MAX;
  state->dropped_events = UINT16_MAX;
  display->text_color = COLOR_ID_MAX;
  display->background_color = COLOR_ID_MAX;
  display_settings_set_digits_mask(0);
  for (int i = 0; i < TIMEZONE_COUNT; i++) {
    TimezoneSettings *zone = &display->zones[i];
    zone->enabled = 0;
    memcpy(zone->label, "ABCDEFGH", TIMEZONE_LABEL_LENGTH + 1);
    zone->text_color = COLOR_ID_MAX;
    zone->background_color = COLOR_ID_MAX;
    zone->utc_offset_minutes = DISPLAY_TIME_MIN_OFFSET_MINUTES;
    zone->transition_at = INT32_MAX;
  }
  for (int i = 0; i < SLOT_COUNT; i++) {
    state->slots[i].hour = 23;
    state->slots[i].minute = 59;
    state->slots[i].enabled = false;
  }
}

/** Oversized or unwritable payloads fail the sync instead of sending garbage. */
static void scenario_payload_limits(void) {
  fill_worst_case_settings();
  char buffer[PHONE_SYNC_PAYLOAD_CAPACITY];
  assert(phone_sync_build_snapshot(buffer, sizeof(buffer)));
  size_t snapshot_length = strlen(buffer);
  char small[64];
  assert(!phone_sync_build_snapshot(small, sizeof(small)));
  assert(strlen(small) < sizeof(small));
  ReminderEvent event = {
    .sequence = UINT32_MAX, .scheduled_at = INT32_MAX, .answered_at = INT32_MAX,
    .slot_id = SLOT_COUNT - 1, .outcome = OUTCOME_NO_RESPONSE,
  };
  assert(phone_sync_build_event(&event, buffer, sizeof(buffer)));
  size_t event_length = strlen(buffer);
  assert(!phone_sync_build_event(&event, small, sizeof(small)));

  fake_outbox_fail_write = true;
  phone_sync_start(true);
  assert(!phone_sync_running() && status_failures == 1 && fake_outbox_count == 0);
  printf("%zu %zu\n", snapshot_length, event_length);
}

/** Event days and offsets follow the Home zone used for scheduling. */
static void scenario_event_home_day(int home_mode) {
  DisplaySettings *display = display_settings();
  TimezoneSettings *home = &display->zones[HOME_TIMEZONE];
  // 2026-01-01T20:00:00Z.
  time_t scheduled = 1767297600;
  if (home_mode == 0) {
    home->use_watch_local = 0;
    home->utc_offset_minutes = 660;
    home->transition_at = (int32_t)(scheduled + 3600);
    home->transition_offset_minutes = 600;
  } else {
    home->use_watch_local = 1;
  }
  ReminderEvent event = {
    .sequence = 3, .scheduled_at = scheduled, .answered_at = scheduled + 60,
    .slot_id = 1, .outcome = OUTCOME_TAKEN,
  };
  char buffer[PHONE_SYNC_PAYLOAD_CAPACITY];
  assert(phone_sync_build_event(&event, buffer, sizeof(buffer)));
  puts(buffer);
}

int main(int argc, char **argv) {
  assert(argc >= 2);
  fake_persist_clear();
  fake_outbox_reset();
  (void)persist_state_load();
  display_settings_load();
  app_state()->settings_revision = 0;
  fake_dict_clear(&incoming);
  for (int i = 2; i + 1 < argc; i += 2) {
    uint32_t key = (uint32_t)atoi(argv[i]);
    if (is_label_key(key)) fake_dict_put_cstring(&incoming, key, argv[i + 1]);
    else fake_dict_put_int(&incoming, key, TUPLE_INT, 4, strtol(argv[i + 1], NULL, 10));
  }
  int scenario = atoi(argv[1]);
  if (scenario == 0) {
    phone_sync_start(false);
    assert(fake_outbox_busy && fake_outbox_messages[0].type == MESSAGE_TYPE_SETTINGS_SNAPSHOT);
    deliver(MESSAGE_TYPE_SETTINGS_UPDATE);
    deliver(MESSAGE_TYPE_REQUEST_SYNC);
    drain();
    printf("%ld %d %d\n", latest_revision(), phone_sync_running(), fake_outbox_busy);
  } else if (scenario == 1) {
    deliver(MESSAGE_TYPE_SETTINGS_UPDATE);
    printf("%d\n", settings_changes);
  } else if (scenario == 3 || scenario == 4) {
    fake_outbox_fail_begin = scenario == 3;
    fake_outbox_fail_send = scenario == 4;
    phone_sync_start(false);
    printf("%d\n", phone_sync_running());
  } else if (scenario == 5) {
    deliver(MESSAGE_TYPE_TIMEZONE_UPDATE);
    printf("%d\n", timezone_changes);
  } else if (scenario == 6) {
    deliver(MESSAGE_TYPE_SETTINGS_UPDATE);
    puts(last_message(MESSAGE_TYPE_SETTINGS_SNAPSHOT)->payload);
  } else if (scenario == 7) {
    deliver(MESSAGE_TYPE_SETTINGS_UPDATE);
    printf("%lu\n", (unsigned long)app_state()->settings_revision);
  } else if (scenario == 8) {
    scenario_tuples();
    puts("ok");
  } else if (scenario == 9) {
    scenario_message_types();
    puts("ok");
  } else if (scenario == 10) {
    scenario_status_restart();
  } else if (scenario == 11) {
    scenario_payload_limits();
  } else if (scenario == 12 || scenario == 13) {
    scenario_event_home_day(scenario - 12);
  }
}
