#pragma once

#include <pebble.h>

#include <stdbool.h>
#include <stdint.h>

#define WATCHFACE_DESCENDER_PADDING 6
#define WATCHFACE_SIDE_INSET 6
#define WATCHFACE_EDGE_MARGIN 4
#define TIMEZONE_FEEDBACK_MS 1200

/** Maps a stored colour ID to a Pebble colour (unknown IDs are white). */
GColor color_for_id(uint8_t color_id);

void watchface_create(Window *window);
void watchface_destroy(void);
void watchface_set_hidden(bool hidden);

/** Redraws the time for the active timezone at the current instant. */
void watchface_update(void);

/** Draws a given time (or the unavailable message) for the active timezone. */
void watchface_render(bool time_available, int hour, int minute);

/** Briefly shows the active timezone's label. */
void watchface_show_timezone_feedback(void);
bool watchface_feedback_active(void);
void watchface_cancel_feedback(void);

/** Moves to the next or previous enabled timezone and shows its label. */
void watchface_cycle_timezone(int8_t direction);
void watchface_select_timezone(uint8_t index);
