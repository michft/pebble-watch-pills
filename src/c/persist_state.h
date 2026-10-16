#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "app_types.h"

#define STATE_VERSION 3
#define STATE_VERSION_V2 2
#define PERSIST_KEY_META 1
#define PERSIST_KEY_EVENTS_BASE 2

/** Version 2 metadata: one checksum covered metadata and events together. */
typedef struct {
  uint16_t version;
  uint32_t install_id;
  uint32_t next_sequence;
  uint32_t settings_revision;
  uint16_t event_count;
  uint16_t dropped_events;
  ReminderSlot slots[SLOT_COUNT];
  uint32_t checksum;
} PersistMetaV2;

/**
 * Version 3 metadata: reminder slots and counters are validated by their own
 * checksum, so corrupt event chunks cannot wipe them.
 */
typedef struct {
  uint16_t version;
  uint32_t install_id;
  uint32_t next_sequence;
  uint32_t settings_revision;
  uint16_t event_count;
  uint16_t dropped_events;
  ReminderSlot slots[SLOT_COUNT];
  uint32_t events_checksum;
  uint32_t meta_checksum;
} PersistMeta;

typedef enum {
  PERSIST_LOAD_OK,
  PERSIST_LOAD_MIGRATED,
  PERSIST_LOAD_EVENTS_DROPPED,
  PERSIST_LOAD_RESET
} PersistLoadResult;

/** Returns the in-memory application state. */
AppState *app_state(void);

/** Persists event chunks and metadata; returns `false` and flags an error on failure. */
bool persist_state_save(void);

/** Resets to the default reminder schedule and persists it. */
void persist_state_reset(void);

/**
 * Restores state. Valid metadata with bad event data keeps the metadata and
 * counts the lost events as dropped; invalid metadata resets everything.
 * Version 2 data is migrated.
 */
PersistLoadResult persist_state_load(void);

/** Returns whether the most recent state save failed. */
bool persist_state_storage_error(void);

/** Version 2 checksum over metadata and events; exposed for migration tests. */
uint32_t persist_state_v2_checksum(const AppState *state);
