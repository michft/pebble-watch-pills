#include "reminder_navigation.h"

#include <stddef.h>

uint8_t reminder_navigation_build_items(
  const bool enabled[REMINDER_NAVIGATION_SLOT_COUNT],
  uint8_t items[REMINDER_NAVIGATION_SLOT_COUNT + 1]
) {
  if (enabled == NULL || items == NULL) return 0;

  uint8_t count = 0;
  for (uint8_t slot = 0; slot < REMINDER_NAVIGATION_SLOT_COUNT; slot++) {
    if (enabled[slot]) items[count++] = slot;
  }
  if (count < REMINDER_NAVIGATION_SLOT_COUNT) {
    items[count++] = REMINDER_NAVIGATION_ADD_ITEM;
  }
  return count;
}

void reminder_navigation_select(
  ReminderNavigation *state,
  const bool enabled[REMINDER_NAVIGATION_SLOT_COUNT]
) {
  if (state == NULL || enabled == NULL) return;

  if (state->screen == REMINDER_NAVIGATION_TIME) {
    state->screen = REMINDER_NAVIGATION_MAIN;
    return;
  }
  if (state->screen != REMINDER_NAVIGATION_MAIN) return;

  uint8_t items[REMINDER_NAVIGATION_SLOT_COUNT + 1];
  uint8_t item_count = reminder_navigation_build_items(enabled, items);
  if (state->main_selection >= item_count) {
    state->main_selection = item_count - 1;
  }

  uint8_t selected_item = items[state->main_selection];
  state->enable_selected_slot = selected_item == REMINDER_NAVIGATION_ADD_ITEM;
  state->edit_field = state->enable_selected_slot ? 1 : 0;
  if (state->enable_selected_slot) {
    for (uint8_t slot = 0; slot < REMINDER_NAVIGATION_SLOT_COUNT; slot++) {
      if (!enabled[slot]) {
        state->selected_slot = slot;
        break;
      }
    }
  } else {
    state->selected_slot = selected_item;
  }
  state->screen = REMINDER_NAVIGATION_EDIT;
}

ReminderAlertAction reminder_navigation_alert_action(
  ReminderAlertButton button
) {
  if (button == REMINDER_ALERT_BUTTON_UP) {
    return REMINDER_ALERT_ACTION_TAKEN;
  }
  if (button == REMINDER_ALERT_BUTTON_BACK) {
    return REMINDER_ALERT_ACTION_DISMISS;
  }
  return REMINDER_ALERT_ACTION_NONE;
}
