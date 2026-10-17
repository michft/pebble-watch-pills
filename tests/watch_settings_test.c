/* Display settings persistence, migration, and per-timezone digit modes. */
#include "pebble_fake.h"

#include <assert.h>

#include "display_settings.h"
#include "display_time.h"
#include "persist_state.h"
#include "phone_sync.h"
#include "ui.h"

extern uint32_t MESSAGE_KEY_TYPE;
extern uint32_t MESSAGE_KEY_H_ALIGN;
extern uint32_t MESSAGE_KEY_V_ALIGN;
extern uint32_t MESSAGE_KEY_FONT_SIZE;
extern uint32_t MESSAGE_KEY_TEXT_COLOR;
extern uint32_t MESSAGE_KEY_BACKGROUND_COLOR;
extern uint32_t MESSAGE_KEY_USE_DIGITS;
extern uint32_t MESSAGE_KEY_TZ_DIGITS_MASK;
extern uint32_t MESSAGE_KEY_TZ_0_ENABLED, MESSAGE_KEY_TZ_1_ENABLED, MESSAGE_KEY_TZ_2_ENABLED, MESSAGE_KEY_TZ_3_ENABLED;
extern uint32_t MESSAGE_KEY_TZ_0_LABEL, MESSAGE_KEY_TZ_1_LABEL, MESSAGE_KEY_TZ_2_LABEL, MESSAGE_KEY_TZ_3_LABEL;
extern uint32_t MESSAGE_KEY_TZ_0_TEXT_COLOR, MESSAGE_KEY_TZ_1_TEXT_COLOR, MESSAGE_KEY_TZ_2_TEXT_COLOR, MESSAGE_KEY_TZ_3_TEXT_COLOR;
extern uint32_t MESSAGE_KEY_TZ_0_BACKGROUND_COLOR, MESSAGE_KEY_TZ_1_BACKGROUND_COLOR,
  MESSAGE_KEY_TZ_2_BACKGROUND_COLOR, MESSAGE_KEY_TZ_3_BACKGROUND_COLOR;
extern uint32_t MESSAGE_KEY_TZ_0_UTC_OFFSET_MINUTES, MESSAGE_KEY_TZ_1_UTC_OFFSET_MINUTES,
  MESSAGE_KEY_TZ_2_UTC_OFFSET_MINUTES, MESSAGE_KEY_TZ_3_UTC_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_TZ_0_TRANSITION_AT, MESSAGE_KEY_TZ_1_TRANSITION_AT,
  MESSAGE_KEY_TZ_2_TRANSITION_AT, MESSAGE_KEY_TZ_3_TRANSITION_AT;
extern uint32_t MESSAGE_KEY_TZ_0_TRANSITION_OFFSET_MINUTES, MESSAGE_KEY_TZ_1_TRANSITION_OFFSET_MINUTES,
  MESSAGE_KEY_TZ_2_TRANSITION_OFFSET_MINUTES, MESSAGE_KEY_TZ_3_TRANSITION_OFFSET_MINUTES;
extern uint32_t MESSAGE_KEY_SLOT_0_HOUR, MESSAGE_KEY_SLOT_1_HOUR, MESSAGE_KEY_SLOT_2_HOUR, MESSAGE_KEY_SLOT_3_HOUR;
extern uint32_t MESSAGE_KEY_SLOT_0_MINUTE, MESSAGE_KEY_SLOT_1_MINUTE, MESSAGE_KEY_SLOT_2_MINUTE, MESSAGE_KEY_SLOT_3_MINUTE;
extern uint32_t MESSAGE_KEY_SLOT_0_ENABLED, MESSAGE_KEY_SLOT_1_ENABLED, MESSAGE_KEY_SLOT_2_ENABLED, MESSAGE_KEY_SLOT_3_ENABLED;

void ui_sync_status_show(void) {}
void ui_sync_status_failed(void) {}
void ui_sync_status_done(void) {}
void ui_settings_changed(void) {}
void ui_timezones_changed(void) {}

/* ---- Migration --------------------------------------------------------- */

static void expect_migrated_base(const DisplaySettings *settings, uint8_t text, uint8_t background) {
  assert(settings->version == DISPLAY_SETTINGS_VERSION);
  assert(display_settings_valid(settings));
  assert(settings->horizontal_alignment == HORIZONTAL_RIGHT);
  assert(settings->vertical_alignment == VERTICAL_BOTTOM);
  assert(settings->font_size == FONT_SMALL);
  assert(settings->text_color == text && settings->background_color == background);
  assert(settings->zones[0].enabled && settings->zones[0].use_watch_local);
  assert(settings->zones[0].text_color == text && settings->zones[0].background_color == background);
  assert(strcmp(settings->zones[0].label, "HOME") == 0);
  assert(settings->zones[1].enabled && !settings->zones[1].use_watch_local);
  assert(!settings->zones[2].enabled && !settings->zones[3].enabled);
}

static void test_label_copy(void) {
  char label[TIMEZONE_LABEL_LENGTH + 1] = "OLD";
  assert(timezone_label_copy(label, "ABCDEFGH", 9) && strcmp(label, "ABCDEFGH") == 0);
  assert(timezone_label_copy(label, "SYD 1", 64) && strcmp(label, "SYD 1") == 0);
  assert(!timezone_label_copy(label, "ABCDEFGHI", 10));
  assert(!timezone_label_copy(label, "ABCDEFGH", 8));
  assert(!timezone_label_copy(label, "", 1));
  assert(!timezone_label_copy(label, "syd", 4));
  assert(!timezone_label_copy(label, "SYD-1", 6));
  assert(strcmp(label, "SYD 1") == 0);
  const char unterminated[TIMEZONE_LABEL_LENGTH + 1] = {'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'};
  assert(!timezone_label_valid(unterminated));
  assert(timezone_label_valid("ABCDEFGH"));
}

static void test_migrations(void) {
  DisplaySettings settings;

  DisplaySettingsV1 v1 = {DISPLAY_SETTINGS_V1_VERSION, HORIZONTAL_RIGHT, VERTICAL_BOTTOM, FONT_SMALL, 9, 3};
  assert(display_settings_migrate(&v1, sizeof(v1), &settings));
  expect_migrated_base(&settings, 9, 3);
  assert(strcmp(settings.zones[1].label, "UTC") == 0);
  assert(settings.zones[1].utc_offset_minutes == 0);
  v1.text_color = LEGACY_COLOR_ID_MAX + 1;
  assert(!display_settings_migrate(&v1, sizeof(v1), &settings));

  DisplaySettingsV2 v2 = {DISPLAY_SETTINGS_V2_VERSION, HORIZONTAL_RIGHT, VERTICAL_BOTTOM, FONT_SMALL, 2, 4, 0, 330};
  assert(display_settings_migrate(&v2, sizeof(v2), &settings));
  expect_migrated_base(&settings, 2, 4);
  assert(settings.zones[1].utc_offset_minutes == 330);
  assert(settings.zones[1].transition_offset_minutes == 330);
  v2.use_local_time = 1;
  assert(display_settings_migrate(&v2, sizeof(v2), &settings));
  assert(settings.zones[1].utc_offset_minutes == 0);
  v2.utc_offset_minutes = 7;
  assert(!display_settings_migrate(&v2, sizeof(v2), &settings));

  DisplaySettingsV3 v3;
  memset(&v3, 0, sizeof(v3));
  v3.version = DISPLAY_SETTINGS_V3_VERSION;
  v3.horizontal_alignment = HORIZONTAL_RIGHT;
  v3.vertical_alignment = VERTICAL_BOTTOM;
  v3.font_size = FONT_SMALL;
  v3.text_color = 1;
  v3.background_color = 0;
  v3.alternate_text_color = 5;
  v3.alternate_background_color = 6;
  v3.alternate_utc_offset_minutes = 600;
  v3.alternate_transition_at = 1000;
  v3.alternate_transition_offset_minutes = 660;
  memcpy(v3.alternate_label, "ABCDEFGH", TIMEZONE_LABEL_LENGTH + 1);
  assert(display_settings_migrate(&v3, sizeof(v3), &settings));
  expect_migrated_base(&settings, 1, 0);
  assert(strcmp(settings.zones[1].label, "ABCDEFGH") == 0);
  assert(settings.zones[1].text_color == 5 && settings.zones[1].background_color == 6);
  assert(settings.zones[1].utc_offset_minutes == 600);
  assert(settings.zones[1].transition_at == 1000);
  assert(settings.zones[1].transition_offset_minutes == 660);
  DisplaySettingsV3 bad = v3;
  memcpy(bad.alternate_label, "ABCDEFGHI", TIMEZONE_LABEL_LENGTH + 1);
  assert(!display_settings_migrate(&bad, sizeof(bad), &settings));
  bad = v3;
  bad.alternate_background_color = LEGACY_COLOR_ID_MAX + 1;
  assert(!display_settings_migrate(&bad, sizeof(bad), &settings));
  bad = v3;
  bad.alternate_transition_at = -1;
  assert(!display_settings_migrate(&bad, sizeof(bad), &settings));

  DisplaySettings current = display_settings_defaults();
  assert(display_settings_valid(&current));
  assert(display_settings_migrate(&current, sizeof(current), &settings));
  assert(memcmp(&settings, &current, sizeof(settings)) == 0);
  DisplaySettings corrupt = current;
  corrupt.font_size = FONT_LARGE + 1;
  assert(!display_settings_migrate(&corrupt, sizeof(corrupt), &settings));
  corrupt = current;
  corrupt.zones[0].enabled = 0;
  assert(!display_settings_migrate(&corrupt, sizeof(corrupt), &settings));
  corrupt = current;
  corrupt.zones[2].label[TIMEZONE_LABEL_LENGTH] = 'X';
  memset(corrupt.zones[2].label, 'A', TIMEZONE_LABEL_LENGTH);
  assert(!display_settings_migrate(&corrupt, sizeof(corrupt), &settings));
  corrupt = current;
  corrupt.version = DISPLAY_SETTINGS_V3_VERSION;
  assert(!display_settings_migrate(&corrupt, sizeof(corrupt), &settings));

  uint8_t bytes[sizeof(DisplaySettings) + 8];
  memset(bytes, 0, sizeof(bytes));
  memcpy(bytes, &current, sizeof(current));
  assert(!display_settings_migrate(bytes, sizeof(bytes), &settings));
  assert(!display_settings_migrate(bytes, sizeof(current) - 1, &settings));
  assert(!display_settings_migrate(bytes, 0, &settings));
  assert(!display_settings_migrate(NULL, sizeof(current), &settings));
}

static void test_load_and_save(void) {
  DisplaySettingsV2 v2 = {DISPLAY_SETTINGS_V2_VERSION, HORIZONTAL_RIGHT, VERTICAL_BOTTOM, FONT_SMALL, 2, 4, 0, 330};
  fake_persist_clear();
  fake_persist_put(PERSIST_KEY_DISPLAY_SETTINGS, &v2, sizeof(v2));
  display_settings_load();
  expect_migrated_base(display_settings(), 2, 4);
  // Migrated settings are rewritten in the current layout.
  assert(persist_get_size(PERSIST_KEY_DISPLAY_SETTINGS) == (int)sizeof(DisplaySettings));
  assert(!display_settings_storage_error());

  uint8_t garbage[17];
  memset(garbage, 0xff, sizeof(garbage));
  fake_persist_put(PERSIST_KEY_DISPLAY_SETTINGS, garbage, sizeof(garbage));
  display_settings_load();
  DisplaySettings defaults = display_settings_defaults();
  assert(memcmp(display_settings(), &defaults, sizeof(defaults)) == 0);
  assert(persist_get_size(PERSIST_KEY_DISPLAY_SETTINGS) == (int)sizeof(DisplaySettings));

  fake_persist_fail_writes(PERSIST_KEY_DISPLAY_SETTINGS, true);
  assert(!display_settings_save());
  assert(display_settings_storage_error());
  fake_persist_fail_writes(PERSIST_KEY_DISPLAY_SETTINGS, false);
  assert(display_settings_save());
  assert(!display_settings_storage_error());
  fake_persist_write_int_status = -1;
  assert(!display_settings_save());
  assert(display_settings_storage_error());
  fake_persist_write_int_status = 0;
}

/* ---- Digit modes through the real settings decoder ---------------------- */

static void put_valid_settings(DictionaryIterator *dict, int32_t type) {
  const uint32_t enabled[] = {MESSAGE_KEY_TZ_0_ENABLED, MESSAGE_KEY_TZ_1_ENABLED,
    MESSAGE_KEY_TZ_2_ENABLED, MESSAGE_KEY_TZ_3_ENABLED};
  const uint32_t labels[] = {MESSAGE_KEY_TZ_0_LABEL, MESSAGE_KEY_TZ_1_LABEL,
    MESSAGE_KEY_TZ_2_LABEL, MESSAGE_KEY_TZ_3_LABEL};
  const uint32_t text[] = {MESSAGE_KEY_TZ_0_TEXT_COLOR, MESSAGE_KEY_TZ_1_TEXT_COLOR,
    MESSAGE_KEY_TZ_2_TEXT_COLOR, MESSAGE_KEY_TZ_3_TEXT_COLOR};
  const uint32_t background[] = {MESSAGE_KEY_TZ_0_BACKGROUND_COLOR, MESSAGE_KEY_TZ_1_BACKGROUND_COLOR,
    MESSAGE_KEY_TZ_2_BACKGROUND_COLOR, MESSAGE_KEY_TZ_3_BACKGROUND_COLOR};
  const uint32_t offsets[] = {MESSAGE_KEY_TZ_0_UTC_OFFSET_MINUTES, MESSAGE_KEY_TZ_1_UTC_OFFSET_MINUTES,
    MESSAGE_KEY_TZ_2_UTC_OFFSET_MINUTES, MESSAGE_KEY_TZ_3_UTC_OFFSET_MINUTES};
  const uint32_t transitions[] = {MESSAGE_KEY_TZ_0_TRANSITION_AT, MESSAGE_KEY_TZ_1_TRANSITION_AT,
    MESSAGE_KEY_TZ_2_TRANSITION_AT, MESSAGE_KEY_TZ_3_TRANSITION_AT};
  const uint32_t transition_offsets[] = {MESSAGE_KEY_TZ_0_TRANSITION_OFFSET_MINUTES,
    MESSAGE_KEY_TZ_1_TRANSITION_OFFSET_MINUTES, MESSAGE_KEY_TZ_2_TRANSITION_OFFSET_MINUTES,
    MESSAGE_KEY_TZ_3_TRANSITION_OFFSET_MINUTES};
  const uint32_t hours[] = {MESSAGE_KEY_SLOT_0_HOUR, MESSAGE_KEY_SLOT_1_HOUR,
    MESSAGE_KEY_SLOT_2_HOUR, MESSAGE_KEY_SLOT_3_HOUR};
  const uint32_t minutes[] = {MESSAGE_KEY_SLOT_0_MINUTE, MESSAGE_KEY_SLOT_1_MINUTE,
    MESSAGE_KEY_SLOT_2_MINUTE, MESSAGE_KEY_SLOT_3_MINUTE};
  const uint32_t slots_enabled[] = {MESSAGE_KEY_SLOT_0_ENABLED, MESSAGE_KEY_SLOT_1_ENABLED,
    MESSAGE_KEY_SLOT_2_ENABLED, MESSAGE_KEY_SLOT_3_ENABLED};
  fake_dict_put_int(dict, MESSAGE_KEY_TYPE, TUPLE_INT, 4, type);
  for (int i = 0; i < TIMEZONE_COUNT; i++) {
    fake_dict_put_int(dict, enabled[i], TUPLE_INT, 4, 1);
    fake_dict_put_cstring(dict, labels[i], "ABCDEFGH");
    fake_dict_put_int(dict, text[i], TUPLE_INT, 4, COLOR_ID_MAX);
    fake_dict_put_int(dict, background[i], TUPLE_INT, 4, COLOR_ID_MAX);
    fake_dict_put_int(dict, offsets[i], TUPLE_INT, 4, DISPLAY_TIME_MAX_OFFSET_MINUTES);
    fake_dict_put_int(dict, transitions[i], TUPLE_INT, 4, 0);
    fake_dict_put_int(dict, transition_offsets[i], TUPLE_INT, 4, DISPLAY_TIME_MAX_OFFSET_MINUTES);
  }
  fake_dict_put_int(dict, MESSAGE_KEY_H_ALIGN, TUPLE_INT, 4, HORIZONTAL_RIGHT);
  fake_dict_put_int(dict, MESSAGE_KEY_V_ALIGN, TUPLE_INT, 4, VERTICAL_BOTTOM);
  fake_dict_put_int(dict, MESSAGE_KEY_FONT_SIZE, TUPLE_INT, 4, FONT_LARGE);
  fake_dict_put_int(dict, MESSAGE_KEY_TEXT_COLOR, TUPLE_INT, 4, COLOR_ID_MAX);
  fake_dict_put_int(dict, MESSAGE_KEY_BACKGROUND_COLOR, TUPLE_INT, 4, COLOR_ID_MAX);
  for (int i = 0; i < SLOT_COUNT; i++) {
    fake_dict_put_int(dict, hours[i], TUPLE_INT, 4, 20 + i);
    fake_dict_put_int(dict, minutes[i], TUPLE_INT, 4, 59);
    fake_dict_put_int(dict, slots_enabled[i], TUPLE_INT, 4, 1);
  }
}

/** argv: previous mask (-2 none, -1 legacy on), requested (-2 absent), write status, legacy flag, type. */
static void run_digit_modes(char **argv) {
  int previous = atoi(argv[2]);
  int requested = atoi(argv[3]);
  int status = atoi(argv[4]);
  int legacy = atoi(argv[5]);
  int type = atoi(argv[6]);
  fake_persist_clear();
  fake_outbox_reset();
  if (previous >= 0) {
    int32_t mask = previous;
    fake_persist_put(PERSIST_KEY_TZ_DIGITS_MASK, &mask, sizeof(mask));
  } else if (previous == -1) {
    int32_t on = 1;
    fake_persist_put(PERSIST_KEY_USE_DIGITS, &on, sizeof(on));
  }
  (void)persist_state_load();
  display_settings_load();
  fake_persist_write_int_status = status < 0 ? status : 0;

  DictionaryIterator dict;
  fake_dict_clear(&dict);
  put_valid_settings(&dict, type);
  fake_dict_put_int(&dict, MESSAGE_KEY_USE_DIGITS, TUPLE_INT, 4, legacy);
  if (requested != -2) fake_dict_put_int(&dict, MESSAGE_KEY_TZ_DIGITS_MASK, TUPLE_INT, 4, requested);
  phone_sync_inbox_received(&dict, NULL);

  char snapshot[PHONE_SYNC_PAYLOAD_CAPACITY];
  assert(phone_sync_build_snapshot(snapshot, sizeof(snapshot)));
  puts(snapshot);
  printf("%u %u", display_settings_digits_mask(), display_settings_load_digits_mask());
  for (int i = 0; i < TIMEZONE_COUNT; i++) printf(" %d", display_settings_zone_uses_digits((uint8_t)i));
  puts("");
}

int main(int argc, char **argv) {
  assert(argc >= 2);
  if (strcmp(argv[1], "migrate") == 0) {
    test_label_copy();
    test_migrations();
    test_load_and_save();
    puts("ok");
    return 0;
  }
  assert(argc == 7);
  run_digit_modes(argv);
  return 0;
}
