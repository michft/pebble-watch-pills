#pragma once

#include <stdbool.h>
#include <stdint.h>

#define REMINDER_NAVIGATION_SLOT_COUNT 4
#define REMINDER_NAVIGATION_ADD_ITEM REMINDER_NAVIGATION_SLOT_COUNT

typedef enum {
  REMINDER_NAVIGATION_TIME,
  REMINDER_NAVIGATION_MAIN,
  REMINDER_NAVIGATION_EDIT
} ReminderNavigationScreen;

typedef struct {
  ReminderNavigationScreen screen;
  uint8_t main_selection;
  uint8_t selected_slot;
  uint8_t edit_field;
  bool enable_selected_slot;
} ReminderNavigation;

typedef enum {
  REMINDER_ALERT_BUTTON_UP,
  REMINDER_ALERT_BUTTON_SELECT,
  REMINDER_ALERT_BUTTON_DOWN,
  REMINDER_ALERT_BUTTON_BACK
} ReminderAlertButton;

typedef enum {
  REMINDER_ALERT_ACTION_NONE,
  REMINDER_ALERT_ACTION_TAKEN,
  REMINDER_ALERT_ACTION_DISMISS
} ReminderAlertAction;

uint8_t reminder_navigation_build_items(
  const bool enabled[REMINDER_NAVIGATION_SLOT_COUNT],
  uint8_t items[REMINDER_NAVIGATION_SLOT_COUNT + 1]
);

void reminder_navigation_select(
  ReminderNavigation *state,
  const bool enabled[REMINDER_NAVIGATION_SLOT_COUNT]
);

ReminderAlertAction reminder_navigation_alert_action(
  ReminderAlertButton button
);
