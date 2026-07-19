function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function pad2(value) {
  return value < 10 ? "0" + value : String(value);
}

function localDay(date) {
  return date.getFullYear()
    + "-" + pad2(date.getMonth() + 1)
    + "-" + pad2(date.getDate());
}

function formatSlotTime(slot, hour12) {
  if (!hour12) {
    return pad2(slot.hour) + ":" + pad2(slot.minute);
  }
  var suffix = slot.hour >= 12 ? "PM" : "AM";
  var hour = slot.hour % 12 || 12;
  return hour + ":" + pad2(slot.minute) + " " + suffix;
}

function countOutcomes(events) {
  var counts = { scheduled: events.length, taken: 0, skipped: 0, noResponse: 0 };
  events.forEach(function (event) {
    if (event.outcome === "taken") {
      counts.taken += 1;
    } else if (event.outcome === "skipped") {
      counts.skipped += 1;
    } else {
      counts.noResponse += 1;
    }
  });
  return counts;
}

function summaryCard(title, counts) {
  var percentage = counts.scheduled === 0
    ? "—"
    : Math.round(counts.taken * 100 / counts.scheduled) + "%";
  return "<section class=card><h2>" + escapeHtml(title) + "</h2>"
    + "<div class=percentage>" + percentage + "</div>"
    + "<p><strong>" + counts.taken + "</strong> self-reported taken · "
    + "<strong>" + counts.skipped + "</strong> skipped · "
    + "<strong>" + counts.noResponse + "</strong> no response</p></section>";
}

function outcomeLabel(outcome) {
  if (outcome === "taken") {
    return "Self-reported taken";
  }
  if (outcome === "skipped") {
    return "Skipped";
  }
  return "No response";
}

function dailyDetails(events) {
  var days = {};
  events.forEach(function (event) {
    days[event.localDay] = days[event.localDay] || [];
    days[event.localDay].push(event);
  });

  var dayKeys = Object.keys(days).sort().reverse();
  if (dayKeys.length === 0) {
    return "<p class=empty>No reminder outcomes synced yet.</p>";
  }

  return dayKeys.map(function (day) {
    var dayEvents = days[day].sort(function (left, right) {
      return left.slotId - right.slotId;
    });
    var counts = countOutcomes(dayEvents);
    var rows = dayEvents.map(function (event) {
      var time = new Date(event.scheduledAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      });
      return "<tr><th scope=row>Pill " + (event.slotId + 1) + "</th><td>"
        + escapeHtml(time) + "</td><td>" + escapeHtml(outcomeLabel(event.outcome))
        + "</td></tr>";
    }).join("");
    return "<details><summary><strong>" + escapeHtml(day) + "</strong> — "
      + counts.taken + "/" + counts.scheduled + " taken</summary>"
      + "<table><thead><tr><th>Pill</th><th>Time</th><th>Outcome</th></tr></thead>"
      + "<tbody>" + rows + "</tbody></table></details>";
  }).join("");
}

function settingsSection(settings) {
  if (!settings || !Array.isArray(settings.slots)) {
    return "<section class=card><h2>Current reminders</h2>"
      + "<p>No settings snapshot synced.</p></section>";
  }
  var hour12 = Boolean(settings.hour12);
  var rows = settings.slots.map(function (slot) {
    return "<tr><th scope=row>Pill " + (slot.id + 1) + "</th><td>"
      + escapeHtml(formatSlotTime(slot, hour12)) + "</td><td>"
      + (slot.enabled ? "On" : "Off") + "</td></tr>";
  }).join("");
  return "<section class=card><h2>Current reminders</h2>"
    + "<p class=muted>Read-only. Edit times on watch.</p>"
    + "<table><thead><tr><th>Pill</th><th>Time</th><th>State</th></tr></thead>"
    + "<tbody>" + rows + "</tbody></table></section>";
}

exports.buildReportPage = function buildReportPage(state) {
  var now = Date.now();
  var todayKey = localDay(new Date(now));
  var sevenDayCutoff = now - 7 * 24 * 60 * 60 * 1000;
  var thirtyDayCutoff = now - 30 * 24 * 60 * 60 * 1000;
  var thirtyDayEvents = state.events.filter(function (event) {
    return event.scheduledAt >= thirtyDayCutoff;
  });
  var sevenDayEvents = state.events.filter(function (event) {
    return event.scheduledAt >= sevenDayCutoff;
  });
  var todayEvents = state.events.filter(function (event) {
    return event.localDay === todayKey;
  });

  var lastSync = state.lastSyncAt
    ? new Date(state.lastSyncAt).toLocaleString()
    : "Never";
  var stale = !state.lastSyncAt || now - state.lastSyncAt > 24 * 60 * 60 * 1000;
  var warning = "";
  if (stale) {
    warning += "<p class=warning>Report may be stale. Open Pill Reminder on watch to sync.</p>";
  }
  if (state.droppedEvents > 0) {
    warning += "<p class=warning>Watch reports " + state.droppedEvents
      + " older event(s) dropped after watch history overflow.</p>";
  }
  if (state.warning) {
    warning += "<p class=warning>" + escapeHtml(state.warning) + "</p>";
  }

  return "<!doctype html><html lang=en><head><meta charset=utf-8>"
    + "<meta name=viewport content='width=device-width,initial-scale=1'>"
    + "<title>Pill Reminder report</title><style>"
    + "body{margin:0;background:#f3f6fa;color:#172033;font:16px -apple-system,BlinkMacSystemFont,sans-serif}"
    + "main{max-width:680px;margin:auto;padding:18px}h1{font-size:28px;margin:0 0 4px}"
    + "h2{font-size:19px;margin:0 0 10px}.muted{color:#5d6b7d}.sync{margin-top:0;color:#45566d}"
    + ".card,details{background:#fff;border:1px solid #d8e0e9;border-radius:12px;padding:15px;margin:12px 0}"
    + ".percentage{font-size:34px;font-weight:700;color:#1e6b91}.warning{background:#fff3cd;border-radius:8px;padding:10px}"
    + "table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 4px;border-bottom:1px solid #e7ecf2}"
    + "summary{cursor:pointer}.empty{padding:15px;background:#fff;border-radius:12px}"
    + "button{width:100%;padding:13px;margin:8px 0;border:0;border-radius:10px;font-size:17px;font-weight:600}"
    + ".danger{background:#b42318;color:#fff}.close{background:#dce8f4;color:#172033}"
    + "</style></head><body><main><h1>Pill Reminder</h1>"
    + "<p class=sync>Last synced: " + escapeHtml(lastSync) + "</p>"
    + warning
    + summaryCard("Today", countOutcomes(todayEvents))
    + summaryCard("Last 7 days", countOutcomes(sevenDayEvents))
    + summaryCard("Last 30 days", countOutcomes(thirtyDayEvents))
    + settingsSection(state.settings)
    + "<section><h2>Daily detail</h2>" + dailyDetails(thirtyDayEvents) + "</section>"
    + "<p class=muted>Taken means self-reported. No response does not prove a missed dose. "
    + "This report is not a medical record.</p>"
    + "<button class=danger onclick=clearHistory()>Clear phone report</button>"
    + "<button class=close onclick=closeReport()>Close</button>"
    + "<script>function closeWith(v){location.href='pebblejs://close#'+encodeURIComponent(JSON.stringify(v))}"
    + "function clearHistory(){if(confirm('Clear phone report history? This cannot be undone.'))closeWith({action:'clear_history'})}"
    + "function closeReport(){closeWith({action:'close'})}</script>"
    + "</main></body></html>";
};
