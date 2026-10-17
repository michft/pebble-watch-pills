/* In-memory fakes for the Pebble storage, wakeup, clock, and AppMessage APIs. */
#include "pebble_fake.h"

#include <assert.h>
#include <stdarg.h>

#define FAKE_PERSIST_CAPACITY 64
#define FAKE_APP_MESSAGE_SIZE 1024
#define DICT_HEADER_SIZE 1
#define TUPLE_HEADER_SIZE 7

void host_app_log(AppLogLevel level, const char *format, ...) {
  (void)level;
  (void)format;
}

/* ---- Storage ----------------------------------------------------------- */

typedef struct {
  bool used;
  uint32_t key;
  size_t size;
  uint8_t data[PERSIST_DATA_MAX_LENGTH];
} FakeEntry;

static FakeEntry s_entries[FAKE_PERSIST_CAPACITY];
static uint32_t s_failing_keys[FAKE_PERSIST_CAPACITY];
static int s_failing_count;
int fake_persist_write_int_status;

static bool write_fails(uint32_t key) {
  for (int i = 0; i < s_failing_count; i++) {
    if (s_failing_keys[i] == key) return true;
  }
  return false;
}

static FakeEntry *find_entry(uint32_t key, bool create) {
  FakeEntry *empty = NULL;
  for (int i = 0; i < FAKE_PERSIST_CAPACITY; i++) {
    if (s_entries[i].used && s_entries[i].key == key) return &s_entries[i];
    if (!s_entries[i].used && empty == NULL) empty = &s_entries[i];
  }
  if (!create) return NULL;
  assert(empty != NULL);
  memset(empty, 0, sizeof(*empty));
  empty->key = key;
  return empty;
}

void fake_persist_clear(void) {
  memset(s_entries, 0, sizeof(s_entries));
  s_failing_count = 0;
  fake_persist_write_int_status = 0;
}

void fake_persist_delete(uint32_t key) {
  FakeEntry *entry = find_entry(key, false);
  if (entry) entry->used = false;
}

void fake_persist_put(uint32_t key, const void *data, size_t size) {
  assert(size <= PERSIST_DATA_MAX_LENGTH);
  FakeEntry *entry = find_entry(key, true);
  memcpy(entry->data, data, size);
  entry->size = size;
  entry->used = true;
}

void fake_persist_fail_writes(uint32_t key, bool fail) {
  for (int i = 0; i < s_failing_count; i++) {
    if (s_failing_keys[i] != key) continue;
    if (!fail) s_failing_keys[i] = s_failing_keys[--s_failing_count];
    return;
  }
  if (fail) {
    assert(s_failing_count < FAKE_PERSIST_CAPACITY);
    s_failing_keys[s_failing_count++] = key;
  }
}

static bool entry_has_data(const FakeEntry *entry) {
  return entry != NULL && entry->used;
}

bool persist_exists(const uint32_t key) {
  return entry_has_data(find_entry(key, false));
}

int persist_get_size(const uint32_t key) {
  FakeEntry *entry = find_entry(key, false);
  return entry_has_data(entry) ? (int)entry->size : E_DOES_NOT_EXIST;
}

int persist_read_data(const uint32_t key, void *buffer, const size_t buffer_size) {
  FakeEntry *entry = find_entry(key, false);
  if (!entry_has_data(entry)) return E_DOES_NOT_EXIST;
  size_t size = entry->size < buffer_size ? entry->size : buffer_size;
  memcpy(buffer, entry->data, size);
  return (int)size;
}

int32_t persist_read_int(const uint32_t key) {
  int32_t value = 0;
  return persist_read_data(key, &value, sizeof(value)) == (int)sizeof(value) ? value : 0;
}

bool persist_read_bool(const uint32_t key) {
  return persist_read_int(key) != 0;
}

int persist_write_data(const uint32_t key, const void *data, const size_t size) {
  if (write_fails(key)) return E_ERROR;
  if (size > PERSIST_DATA_MAX_LENGTH) return E_ERROR;
  fake_persist_put(key, data, size);
  return (int)size;
}

status_t persist_write_int(const uint32_t key, const int32_t value) {
  if (fake_persist_write_int_status < 0) return fake_persist_write_int_status;
  int written = persist_write_data(key, &value, sizeof(value));
  return written;
}

/* ---- Wakeup and clock -------------------------------------------------- */

time_t fake_wakeup_time;
int32_t fake_wakeup_cookie = -1;
int fake_wakeup_count;
bool fake_wakeup_fail;
bool fake_clock_24h = true;

WakeupId wakeup_schedule(time_t timestamp, int32_t cookie, bool notify_if_missed) {
  (void)notify_if_missed;
  if (fake_wakeup_fail) return E_ERROR;
  fake_wakeup_time = timestamp;
  fake_wakeup_cookie = cookie;
  return ++fake_wakeup_count;
}

void wakeup_cancel_all(void) {
  fake_wakeup_time = 0;
  fake_wakeup_cookie = -1;
}

bool clock_is_24h_style(void) {
  return fake_clock_24h;
}

/* ---- Dictionaries ------------------------------------------------------ */

static Tuple *dict_slot(DictionaryIterator *iter, uint32_t key) {
  for (uint16_t i = 0; i < iter->count; i++) {
    if (iter->tuples[i].key == key) return &iter->tuples[i];
  }
  assert(iter->count < FAKE_DICT_CAPACITY);
  Tuple *tuple = &iter->tuples[iter->count++];
  memset(tuple, 0, sizeof(*tuple));
  tuple->key = key;
  return tuple;
}

void fake_dict_clear(DictionaryIterator *iter) {
  memset(iter, 0, sizeof(*iter));
}

void fake_dict_put_int(DictionaryIterator *iter, uint32_t key, TupleType type, uint16_t width, int64_t value) {
  Tuple *tuple = dict_slot(iter, key);
  memset(tuple->value, 0, sizeof(tuple->value));
  tuple->type = type;
  tuple->length = width;
  if (type == TUPLE_INT && width == 1) tuple->value->int8 = (int8_t)value;
  else if (type == TUPLE_INT && width == 2) tuple->value->int16 = (int16_t)value;
  else if (type == TUPLE_INT) tuple->value->int32 = (int32_t)value;
  else if (width == 1) tuple->value->uint8 = (uint8_t)value;
  else if (width == 2) tuple->value->uint16 = (uint16_t)value;
  else tuple->value->uint32 = (uint32_t)value;
}

void fake_dict_put_raw(DictionaryIterator *iter, uint32_t key, const char *bytes, uint16_t length) {
  assert(length <= HOST_TUPLE_DATA_SIZE);
  Tuple *tuple = dict_slot(iter, key);
  memset(tuple->value, 0x7f, sizeof(tuple->value));
  tuple->type = TUPLE_CSTRING;
  tuple->length = length;
  memcpy(tuple->value->cstring, bytes, length);
}

void fake_dict_put_cstring(DictionaryIterator *iter, uint32_t key, const char *value) {
  fake_dict_put_raw(iter, key, value, (uint16_t)(strlen(value) + 1));
}

void fake_dict_remove(DictionaryIterator *iter, uint32_t key) {
  for (uint16_t i = 0; i < iter->count; i++) {
    if (iter->tuples[i].key != key) continue;
    iter->tuples[i] = iter->tuples[--iter->count];
    return;
  }
}

Tuple *dict_find(const DictionaryIterator *iter, const uint32_t key) {
  DictionaryIterator *mutable_iter = (DictionaryIterator *)iter;
  for (uint16_t i = 0; i < mutable_iter->count; i++) {
    if (mutable_iter->tuples[i].key == key) return &mutable_iter->tuples[i];
  }
  return NULL;
}

/* ---- Outbox ------------------------------------------------------------ */

bool fake_outbox_busy;
bool fake_outbox_fail_begin;
bool fake_outbox_fail_send;
bool fake_outbox_fail_write;
int fake_outbox_count;
FakeOutboxMessage fake_outbox_messages[FAKE_OUTBOX_HISTORY];
DictionaryIterator fake_outbox;
static FakeOutboxMessage s_pending;
static size_t s_pending_size;
static bool s_writing;

void fake_outbox_reset(void) {
  fake_outbox_busy = false;
  fake_outbox_fail_begin = false;
  fake_outbox_fail_send = false;
  fake_outbox_fail_write = false;
  fake_outbox_count = 0;
  s_writing = false;
}

AppMessageResult app_message_outbox_begin(DictionaryIterator **iterator) {
  if (fake_outbox_busy || fake_outbox_fail_begin) return APP_MSG_BUSY;
  memset(&s_pending, 0, sizeof(s_pending));
  s_pending.type = -1;
  s_pending_size = DICT_HEADER_SIZE;
  s_writing = true;
  *iterator = &fake_outbox;
  return APP_MSG_OK;
}

DictionaryResult dict_write_int32(DictionaryIterator *iter, const uint32_t key, const int32_t value) {
  assert(iter == &fake_outbox && s_writing);
  (void)key;
  if (fake_outbox_fail_write) return DICT_NOT_ENOUGH_STORAGE;
  s_pending_size += TUPLE_HEADER_SIZE + sizeof(value);
  if (s_pending_size > FAKE_APP_MESSAGE_SIZE) return DICT_NOT_ENOUGH_STORAGE;
  s_pending.type = value;
  return DICT_OK;
}

DictionaryResult dict_write_cstring(DictionaryIterator *iter, const uint32_t key, const char *cstring) {
  assert(iter == &fake_outbox && s_writing);
  (void)key;
  size_t length = strlen(cstring) + 1;
  s_pending_size += TUPLE_HEADER_SIZE + length;
  if (fake_outbox_fail_write || s_pending_size > FAKE_APP_MESSAGE_SIZE) return DICT_NOT_ENOUGH_STORAGE;
  memcpy(s_pending.payload, cstring, length);
  return DICT_OK;
}

AppMessageResult app_message_outbox_send(void) {
  assert(s_writing);
  s_writing = false;
  if (fake_outbox_fail_send) return APP_MSG_BUSY;
  fake_outbox_busy = true;
  assert(fake_outbox_count < FAKE_OUTBOX_HISTORY);
  fake_outbox_messages[fake_outbox_count++] = s_pending;
  return APP_MSG_OK;
}
