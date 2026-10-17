/* Reminder state persistence: validation, partial recovery, and V2 migration. */
#include "pebble_fake.h"

#include <assert.h>

#include "persist_state.h"

#define EVENTS_PER_CHUNK ((uint16_t)(PERSIST_DATA_MAX_LENGTH / sizeof(ReminderEvent)))

static void fill_state(uint16_t event_count) {
  AppState *state = app_state();
  state->install_id = 0x12345678u;
  state->next_sequence = 1000;
  state->settings_revision = 42;
  state->dropped_events = 3;
  for (int i = 0; i < SLOT_COUNT; i++) {
    state->slots[i].hour = (uint8_t)(6 + i);
    state->slots[i].minute = (uint8_t)(10 * i);
    state->slots[i].enabled = i % 2 == 0;
    state->slots[i].wakeup_id = -1;
    state->slots[i].scheduled_at = 1767000000 + i;
  }
  state->event_count = event_count;
  for (uint16_t i = 0; i < event_count; i++) {
    ReminderEvent *event = &state->events[i];
    memset(event, 0, sizeof(*event));
    event->sequence = 900u + i;
    event->scheduled_at = 1767000000 + i * 3600;
    event->answered_at = i % 3 == 0 ? event->scheduled_at + 60 : 0;
    event->slot_id = (uint8_t)(i % SLOT_COUNT);
    event->outcome = (uint8_t)(i % 3 == 0 ? OUTCOME_TAKEN : OUTCOME_NO_RESPONSE);
  }
}

static void expect_meta(const AppState *expected) {
  const AppState *state = app_state();
  assert(state->version == STATE_VERSION);
  assert(state->install_id == expected->install_id);
  assert(state->next_sequence == expected->next_sequence);
  assert(state->settings_revision == expected->settings_revision);
  assert(memcmp(state->slots, expected->slots, sizeof(state->slots)) == 0);
}

static void expect_events(const AppState *expected) {
  const AppState *state = app_state();
  assert(state->event_count == expected->event_count);
  assert(state->dropped_events == expected->dropped_events);
  assert(memcmp(state->events, expected->events, sizeof(ReminderEvent) * state->event_count) == 0);
}

static void scramble_memory(void) {
  memset(app_state(), 0x5a, sizeof(AppState));
}

static void corrupt_byte(uint32_t key, size_t offset) {
  uint8_t data[PERSIST_DATA_MAX_LENGTH];
  int size = persist_read_data(key, data, sizeof(data));
  assert(size > (int)offset);
  data[offset] ^= 0x01;
  fake_persist_put(key, data, (size_t)size);
}

static void test_fresh_install(void) {
  fake_persist_clear();
  assert(persist_state_load() == PERSIST_LOAD_RESET);
  const AppState *state = app_state();
  const uint8_t hours[SLOT_COUNT] = {8, 12, 18, 22};
  for (int i = 0; i < SLOT_COUNT; i++) {
    assert(state->slots[i].hour == hours[i] && state->slots[i].enabled);
  }
  assert(state->event_count == 0 && state->next_sequence == 1 && state->settings_revision == 1);
  assert(persist_get_size(PERSIST_KEY_META) == (int)sizeof(PersistMeta));
}

static void test_round_trip(uint16_t event_count) {
  fake_persist_clear();
  fill_state(event_count);
  assert(persist_state_save() && !persist_state_storage_error());
  AppState expected = *app_state();
  scramble_memory();
  assert(persist_state_load() == PERSIST_LOAD_OK);
  expect_meta(&expected);
  expect_events(&expected);
}

static void test_bad_events_keep_meta(void) {
  for (int mode = 0; mode < 3; mode++) {
    fake_persist_clear();
    fill_state(EVENT_LIMIT);
    assert(persist_state_save());
    AppState expected = *app_state();
    if (mode == 0) corrupt_byte(PERSIST_KEY_EVENTS_BASE + 1, 5);
    else if (mode == 1) fake_persist_delete(PERSIST_KEY_EVENTS_BASE + 2);
    else fake_persist_put(PERSIST_KEY_EVENTS_BASE, "x", 1);
    scramble_memory();
    assert(persist_state_load() == PERSIST_LOAD_EVENTS_DROPPED);
    expect_meta(&expected);
    assert(app_state()->event_count == 0);
    assert(app_state()->dropped_events == expected.dropped_events + EVENT_LIMIT);
    // The repaired state is saved and reloads cleanly.
    AppState repaired = *app_state();
    scramble_memory();
    assert(persist_state_load() == PERSIST_LOAD_OK);
    expect_meta(&repaired);
    expect_events(&repaired);
  }
}

static void test_dropped_count_saturates(void) {
  fake_persist_clear();
  fill_state(10);
  app_state()->dropped_events = UINT16_MAX - 2;
  assert(persist_state_save());
  corrupt_byte(PERSIST_KEY_EVENTS_BASE, 0);
  assert(persist_state_load() == PERSIST_LOAD_EVENTS_DROPPED);
  assert(app_state()->dropped_events == UINT16_MAX);
}

static void test_bad_meta_resets(void) {
  fake_persist_clear();
  fill_state(4);
  assert(persist_state_save());
  corrupt_byte(PERSIST_KEY_META, offsetof(PersistMeta, settings_revision));
  assert(persist_state_load() == PERSIST_LOAD_RESET);
  assert(app_state()->settings_revision == 1 && app_state()->event_count == 0);

  fake_persist_clear();
  fill_state(4);
  assert(persist_state_save());
  fake_persist_put(PERSIST_KEY_META, "short", 5);
  assert(persist_state_load() == PERSIST_LOAD_RESET);
}

static void write_v2(const AppState *source, bool valid_checksum) {
  AppState legacy = *source;
  legacy.version = STATE_VERSION_V2;
  PersistMetaV2 meta;
  memset(&meta, 0, sizeof(meta));
  meta.version = STATE_VERSION_V2;
  meta.install_id = legacy.install_id;
  meta.next_sequence = legacy.next_sequence;
  meta.settings_revision = legacy.settings_revision;
  meta.event_count = legacy.event_count;
  meta.dropped_events = legacy.dropped_events;
  memcpy(meta.slots, legacy.slots, sizeof(meta.slots));
  meta.checksum = persist_state_v2_checksum(&legacy) + (valid_checksum ? 0 : 1);
  fake_persist_put(PERSIST_KEY_META, &meta, sizeof(meta));
}

static void test_v2_migration(void) {
  // Version 2 event chunks share the same keys and layout.
  fake_persist_clear();
  fill_state(20);
  assert(persist_state_save());
  AppState expected = *app_state();
  write_v2(&expected, true);
  scramble_memory();
  assert(persist_state_load() == PERSIST_LOAD_MIGRATED);
  expect_meta(&expected);
  expect_events(&expected);
  assert(persist_get_size(PERSIST_KEY_META) == (int)sizeof(PersistMeta));
  scramble_memory();
  assert(persist_state_load() == PERSIST_LOAD_OK);
  expect_events(&expected);

  fake_persist_clear();
  fill_state(20);
  assert(persist_state_save());
  expected = *app_state();
  write_v2(&expected, false);
  assert(persist_state_load() == PERSIST_LOAD_EVENTS_DROPPED);
  expect_meta(&expected);
  assert(app_state()->event_count == 0 && app_state()->dropped_events == expected.dropped_events + 20);

  fake_persist_clear();
  fill_state(2);
  app_state()->slots[1].hour = 30;
  assert(persist_state_save());
  expected = *app_state();
  write_v2(&expected, false);
  assert(persist_state_load() == PERSIST_LOAD_RESET);
}

static void test_save_failure(void) {
  fake_persist_clear();
  fill_state((uint16_t)(EVENTS_PER_CHUNK + 1));
  fake_persist_fail_writes(PERSIST_KEY_META, true);
  assert(!persist_state_save() && persist_state_storage_error());
  fake_persist_fail_writes(PERSIST_KEY_META, false);
  fake_persist_fail_writes(PERSIST_KEY_EVENTS_BASE + 1, true);
  assert(!persist_state_save() && persist_state_storage_error());
  fake_persist_fail_writes(PERSIST_KEY_EVENTS_BASE + 1, false);
  assert(persist_state_save() && !persist_state_storage_error());
}

int main(void) {
  test_fresh_install();
  test_round_trip(0);
  test_round_trip(1);
  test_round_trip(EVENTS_PER_CHUNK);
  test_round_trip(EVENT_LIMIT);
  test_bad_events_keep_meta();
  test_dropped_count_saturates();
  test_bad_meta_resets();
  test_v2_migration();
  test_save_failure();
  puts("ok");
}
