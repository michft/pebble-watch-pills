/* Controls for the in-memory Pebble fakes in pebble_fake.c. */
#pragma once

#include <pebble.h>

#define FAKE_DICT_CAPACITY 96
#define FAKE_OUTBOX_HISTORY 512

struct DictionaryIterator {
  Tuple tuples[FAKE_DICT_CAPACITY];
  uint16_t count;
};

/* Storage */
void fake_persist_clear(void);
void fake_persist_delete(uint32_t key);
/** Stores raw bytes without going through persist_write_data failure injection. */
void fake_persist_put(uint32_t key, const void *data, size_t size);
/** Makes writes to `key` fail (or succeed again when `fail` is false). */
void fake_persist_fail_writes(uint32_t key, bool fail);
/** Overrides the persist_write_int return value; 0 restores normal behaviour. */
extern int fake_persist_write_int_status;

/* Wakeup */
extern time_t fake_wakeup_time;
extern int32_t fake_wakeup_cookie;
extern int fake_wakeup_count;
extern bool fake_wakeup_fail;

/* Clock */
extern bool fake_clock_24h;

/* Dictionaries */
void fake_dict_clear(DictionaryIterator *iter);
void fake_dict_put_int(DictionaryIterator *iter, uint32_t key, TupleType type, uint16_t width, int64_t value);
void fake_dict_put_cstring(DictionaryIterator *iter, uint32_t key, const char *value);
/** Stores a raw string tuple with an explicit length (may omit the NUL). */
void fake_dict_put_raw(DictionaryIterator *iter, uint32_t key, const char *bytes, uint16_t length);
void fake_dict_remove(DictionaryIterator *iter, uint32_t key);

/* Outbox */
typedef struct {
  int32_t type;
  char payload[1024];
} FakeOutboxMessage;
extern bool fake_outbox_busy;
extern bool fake_outbox_fail_begin;
extern bool fake_outbox_fail_send;
extern bool fake_outbox_fail_write;
extern int fake_outbox_count;
extern FakeOutboxMessage fake_outbox_messages[FAKE_OUTBOX_HISTORY];
extern DictionaryIterator fake_outbox;
void fake_outbox_reset(void);
