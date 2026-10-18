#pragma once

#include <stdbool.h>
#include <stdint.h>

/** Creates the window, layers, and button/tick handlers. */
void ui_init(void);

/** Pushes the app window onto the window stack. */
void ui_push(void);

void ui_deinit(void);

void ui_show_watchface(void);

/** Records a fired reminder, reschedules, and shows the alert. */
void ui_handle_wakeup(uint8_t slot_id);

/* Phone sync notifications. */

/** Shows (or re-shows) the phone report status screen. */
void ui_sync_status_show(void);

/** Reports that the phone could not be reached. */
void ui_sync_status_failed(void);

/** Leaves the status screen once a status sync completes. */
void ui_sync_status_done(void);

/** Redraws after phone settings were applied; resets the shown timezone. */
void ui_settings_changed(void);

/** Redraws after phone timezone data changed. */
void ui_timezones_changed(void);
