#pragma once

#include <pebble.h>

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "app_types.h"

#define APP_MESSAGE_BUFFER_SIZE 1024
/** Dictionary header plus TYPE (int32) and PAYLOAD tuple headers. */
#define APP_MESSAGE_DICT_OVERHEAD (1 + 7 + 4 + 7)
/** Largest payload string, including its NUL, that fits the outbox. */
#define PHONE_SYNC_PAYLOAD_CAPACITY (APP_MESSAGE_BUFFER_SIZE - APP_MESSAGE_DICT_OVERHEAD)

/**
 * Starts sending settings and history. While a sync is running it restarts
 * after the in-flight message; `show_status` (re)displays the status screen.
 */
void phone_sync_start(bool show_status);

/** Stops showing status for the running sync; the transfer continues. */
void phone_sync_hide_status(void);

bool phone_sync_running(void);

void phone_sync_inbox_received(DictionaryIterator *iterator, void *context);
void phone_sync_outbox_sent(DictionaryIterator *iterator, void *context);
void phone_sync_outbox_failed(DictionaryIterator *iterator, AppMessageResult reason, void *context);

/** Reads an integer tuple of any TUPLE_INT/TUPLE_UINT width (1, 2, or 4 bytes). */
bool tuple_int(const Tuple *tuple, int32_t *value);

/** Reads and validates a NUL-terminated timezone label tuple without truncating it. */
bool tuple_label(const Tuple *tuple, char label[TIMEZONE_LABEL_LENGTH + 1]);

/** Builds the settings snapshot JSON; returns `false` if it does not fit. */
bool phone_sync_build_snapshot(char *buffer, size_t size);

/** Builds one event batch JSON message; returns `false` if it does not fit. */
bool phone_sync_build_event(const ReminderEvent *event, char *buffer, size_t size);
