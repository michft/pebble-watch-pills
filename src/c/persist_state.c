#include <pebble.h>

#include "persist_state.h"

#include <string.h>

#define EVENTS_PER_CHUNK ((uint16_t)(PERSIST_DATA_MAX_LENGTH / sizeof(ReminderEvent)))
#define CHECKSUM_SEED 2166136261u
#define CHECKSUM_PRIME 16777619u
#define FIRST_SEQUENCE 1
#define FIRST_SETTINGS_REVISION 1
#define NO_WAKEUP (-1)

_Static_assert(sizeof(PersistMeta) <= PERSIST_DATA_MAX_LENGTH, "PersistMeta exceeds Pebble value limit");
_Static_assert(sizeof(PersistMetaV2) <= PERSIST_DATA_MAX_LENGTH, "PersistMetaV2 exceeds Pebble value limit");
_Static_assert(EVENTS_PER_CHUNK > 0, "ReminderEvent exceeds Pebble value limit");

static const uint8_t DEFAULT_SLOT_HOURS[SLOT_COUNT] = {8, 12, 18, 22};

static struct {
  AppState state;
  bool storage_error;
} s_persist;

AppState *app_state(void) {
  return &s_persist.state;
}

bool persist_state_storage_error(void) {
  return s_persist.storage_error;
}

static uint32_t checksum_bytes(uint32_t checksum, const void *data, size_t size) {
  const uint8_t *bytes = data;
  for (size_t i = 0; i < size; i++) {
    checksum ^= bytes[i];
    checksum *= CHECKSUM_PRIME;
  }
  return checksum;
}

#define CHECKSUM_FIELD(checksum, field) checksum_bytes((checksum), &(field), sizeof(field))

uint32_t persist_state_v2_checksum(const AppState *state) {
  uint32_t checksum = CHECKSUM_SEED;
  checksum = CHECKSUM_FIELD(checksum, state->version);
  checksum = CHECKSUM_FIELD(checksum, state->install_id);
  checksum = CHECKSUM_FIELD(checksum, state->next_sequence);
  checksum = CHECKSUM_FIELD(checksum, state->settings_revision);
  checksum = CHECKSUM_FIELD(checksum, state->event_count);
  checksum = CHECKSUM_FIELD(checksum, state->dropped_events);
  checksum = CHECKSUM_FIELD(checksum, state->slots);
  return checksum_bytes(checksum, state->events, sizeof(ReminderEvent) * state->event_count);
}

static uint32_t events_checksum(const AppState *state) {
  uint32_t checksum = CHECKSUM_FIELD(CHECKSUM_SEED, state->event_count);
  return checksum_bytes(checksum, state->events, sizeof(ReminderEvent) * state->event_count);
}

static uint32_t meta_checksum(const PersistMeta *meta) {
  uint32_t checksum = CHECKSUM_SEED;
  checksum = CHECKSUM_FIELD(checksum, meta->version);
  checksum = CHECKSUM_FIELD(checksum, meta->install_id);
  checksum = CHECKSUM_FIELD(checksum, meta->next_sequence);
  checksum = CHECKSUM_FIELD(checksum, meta->settings_revision);
  checksum = CHECKSUM_FIELD(checksum, meta->event_count);
  checksum = CHECKSUM_FIELD(checksum, meta->dropped_events);
  checksum = CHECKSUM_FIELD(checksum, meta->slots);
  return CHECKSUM_FIELD(checksum, meta->events_checksum);
}

static uint16_t event_chunk_size(uint16_t offset, uint16_t event_count) {
  uint16_t remaining = event_count - offset;
  return remaining < EVENTS_PER_CHUNK ? remaining : EVENTS_PER_CHUNK;
}

bool persist_state_save(void) {
  AppState *state = &s_persist.state;
  for (uint16_t offset = 0, chunk = 0; offset < state->event_count; chunk++) {
    uint16_t count = event_chunk_size(offset, state->event_count);
    size_t size = sizeof(ReminderEvent) * count;
    int written = persist_write_data(PERSIST_KEY_EVENTS_BASE + chunk, &state->events[offset], size);
    if (written != (int)size) {
      APP_LOG(APP_LOG_LEVEL_ERROR, "Event persistence failed: %d", written);
      s_persist.storage_error = true;
      return false;
    }
    offset += count;
  }

  PersistMeta meta;
  memset(&meta, 0, sizeof(meta));
  meta.version = STATE_VERSION;
  meta.install_id = state->install_id;
  meta.next_sequence = state->next_sequence;
  meta.settings_revision = state->settings_revision;
  meta.event_count = state->event_count;
  meta.dropped_events = state->dropped_events;
  memcpy(meta.slots, state->slots, sizeof(meta.slots));
  meta.events_checksum = events_checksum(state);
  meta.meta_checksum = meta_checksum(&meta);
  int written = persist_write_data(PERSIST_KEY_META, &meta, sizeof(meta));
  if (written != (int)sizeof(meta)) {
    APP_LOG(APP_LOG_LEVEL_ERROR, "Metadata persistence failed: %d", written);
    s_persist.storage_error = true;
    return false;
  }

  s_persist.storage_error = false;
  return true;
}

void persist_state_reset(void) {
  AppState *state = &s_persist.state;
  memset(state, 0, sizeof(*state));
  state->version = STATE_VERSION;
  state->install_id = (uint32_t)time(NULL) ^ (uint32_t)(uintptr_t)state;
  state->next_sequence = FIRST_SEQUENCE;
  state->settings_revision = FIRST_SETTINGS_REVISION;
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    state->slots[i].hour = DEFAULT_SLOT_HOURS[i];
    state->slots[i].enabled = true;
    state->slots[i].wakeup_id = NO_WAKEUP;
  }
  (void)persist_state_save();
}

static bool read_events(AppState *state) {
  for (uint16_t offset = 0, chunk = 0; offset < state->event_count; chunk++) {
    uint16_t count = event_chunk_size(offset, state->event_count);
    size_t size = sizeof(ReminderEvent) * count;
    if (persist_read_data(PERSIST_KEY_EVENTS_BASE + chunk, &state->events[offset], size) != (int)size) {
      return false;
    }
    offset += count;
  }
  return true;
}

/** Empties event history, counting the lost events as dropped. */
static void drop_events(AppState *state) {
  uint32_t dropped = (uint32_t)state->dropped_events + state->event_count;
  state->dropped_events = dropped > UINT16_MAX ? UINT16_MAX : (uint16_t)dropped;
  state->event_count = 0;
  memset(state->events, 0, sizeof(state->events));
}

static bool slots_sane(const ReminderSlot slots[SLOT_COUNT]) {
  for (uint8_t i = 0; i < SLOT_COUNT; i++) {
    if (slots[i].hour >= HOURS_PER_DAY || slots[i].minute >= MINUTES_PER_HOUR) return false;
  }
  return true;
}

static void restore_meta(
  AppState *state,
  uint32_t install_id,
  uint32_t next_sequence,
  uint32_t settings_revision,
  uint16_t event_count,
  uint16_t dropped_events,
  const ReminderSlot slots[SLOT_COUNT]
) {
  memset(state, 0, sizeof(*state));
  state->version = STATE_VERSION;
  state->install_id = install_id;
  state->next_sequence = next_sequence;
  state->settings_revision = settings_revision;
  state->event_count = event_count;
  state->dropped_events = dropped_events;
  memcpy(state->slots, slots, sizeof(state->slots));
}

static bool load_current(PersistLoadResult *result) {
  PersistMeta meta;
  if (
    persist_get_size(PERSIST_KEY_META) != (int)sizeof(meta)
    || persist_read_data(PERSIST_KEY_META, &meta, sizeof(meta)) != (int)sizeof(meta)
    || meta.version != STATE_VERSION
    || meta.meta_checksum != meta_checksum(&meta)
    || meta.event_count > EVENT_LIMIT
    || !slots_sane(meta.slots)
  ) return false;
  AppState *state = &s_persist.state;
  restore_meta(
    state, meta.install_id, meta.next_sequence, meta.settings_revision,
    meta.event_count, meta.dropped_events, meta.slots
  );
  if (read_events(state) && events_checksum(state) == meta.events_checksum) {
    *result = PERSIST_LOAD_OK;
  } else {
    APP_LOG(APP_LOG_LEVEL_WARNING, "Event history unreadable; keeping settings");
    drop_events(state);
    *result = PERSIST_LOAD_EVENTS_DROPPED;
  }
  return true;
}

static bool load_v2(PersistLoadResult *result) {
  PersistMetaV2 meta;
  if (
    persist_get_size(PERSIST_KEY_META) != (int)sizeof(meta)
    || persist_read_data(PERSIST_KEY_META, &meta, sizeof(meta)) != (int)sizeof(meta)
    || meta.version != STATE_VERSION_V2
    || meta.event_count > EVENT_LIMIT
    || !slots_sane(meta.slots)
  ) return false;
  AppState *state = &s_persist.state;
  restore_meta(
    state, meta.install_id, meta.next_sequence, meta.settings_revision,
    meta.event_count, meta.dropped_events, meta.slots
  );
  // The version 2 checksum was computed with the old version number.
  state->version = STATE_VERSION_V2;
  bool events_valid = read_events(state) && persist_state_v2_checksum(state) == meta.checksum;
  state->version = STATE_VERSION;
  if (events_valid) {
    *result = PERSIST_LOAD_MIGRATED;
  } else {
    // One checksum covered both parts; keep plausible settings, drop history.
    APP_LOG(APP_LOG_LEVEL_WARNING, "Version 2 checksum mismatch; keeping settings");
    drop_events(state);
    *result = PERSIST_LOAD_EVENTS_DROPPED;
  }
  return true;
}

PersistLoadResult persist_state_load(void) {
  PersistLoadResult result = PERSIST_LOAD_RESET;
  if (load_current(&result) || load_v2(&result)) {
    if (result != PERSIST_LOAD_OK) (void)persist_state_save();
    return result;
  }
  persist_state_reset();
  return PERSIST_LOAD_RESET;
}
