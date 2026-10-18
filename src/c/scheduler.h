#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <time.h>

#include "app_types.h"

/** Returns the Home-zone YYYYMMDD day key for an instant. */
bool scheduler_home_day_key(time_t instant, int32_t *day_key);

/** Returns the Home zone's UTC offset (minutes east of UTC) in force at an instant. */
bool scheduler_home_offset_minutes(time_t instant, int32_t *offset_minutes);

/**
 * Returns the next occurrence of a slot in the Home zone, skipping the Home
 * day of the slot's most recent event; returns 0 if none can be found.
 */
time_t scheduler_next_time(uint8_t slot_id, const ReminderSlot *slot, time_t now);

/** Returns whether enabled slots are fewer than two minutes apart on the clock. */
bool scheduler_times_too_close(const ReminderSlot proposed[SLOT_COUNT]);

/** Recalculates every slot, schedules the earliest wakeup, and saves state. */
void scheduler_schedule_next(void);

/** Returns whether the last schedule attempt failed. */
bool scheduler_error(void);

/** Records an event unless the slot already has one for that Home day; returns its sequence. */
uint32_t scheduler_add_event(uint8_t slot_id, time_t scheduled_at);

/** Records overdue events for enabled slots except `excluded_slot` (-1 for none). */
void scheduler_recover_events_except(int8_t excluded_slot);

/** Records a fired slot's event and reschedules; returns the event sequence or 0. */
uint32_t scheduler_handle_wakeup(uint8_t slot_id);

/** Stores an outcome on an event; returns `false` if the sequence is unknown. */
bool scheduler_record_outcome(uint32_t sequence, Outcome outcome, time_t answered_at);
