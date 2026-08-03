var timezone = require("./timezone");
var TIMEZONE_COUNT = timezone.TIMEZONE_COUNT;
var normaliseZones = timezone.normaliseZones;

/**
 * Escapes HTML special characters in a value converted to a string.
 * @param {*} value - The value to escape.
 * @return {string} The HTML-escaped string.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Formats a value with a leading zero when it is less than 10.
 * @param {number} value - The value to format.
 * @return {string} The value as a string, prefixed with `0` when less than 10.
 */
function pad2(value) {
  return value < 10 ? "0" + value : String(value);
}

/**
 * Formats a date as a local calendar date.
 * @param {Date} date - The date to format.
 * @return {string} The date in `YYYY-MM-DD` format.
 */
function localDay(date) {
  return date.getFullYear()
    + "-" + pad2(date.getMonth() + 1)
    + "-" + pad2(date.getDate());
}

function dayOrdinal(dayKey) {
  var parts = String(dayKey).split("-").map(Number);
  if (parts.length !== 3 || parts.some(function (part) { return !Number.isInteger(part); })) {
    return null;
  }
  return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / (24 * 60 * 60 * 1000));
}

/**
 * Formats a reminder slot time in 12-hour or 24-hour notation.
 * @param {Object} slot - The slot containing `hour` and `minute` values.
 * @param {boolean} hour12 - Whether to use 12-hour notation with an AM or PM suffix.
 * @return {string} The formatted slot time.
 */
function formatSlotTime(slot, hour12) {
  if (!hour12) {
    return pad2(slot.hour) + ":" + pad2(slot.minute);
  }
  var suffix = slot.hour >= 12 ? "PM" : "AM";
  var hour = slot.hour % 12 || 12;
  return hour + ":" + pad2(slot.minute) + " " + suffix;
}

function expectedEvents(events, homeTimeZone) {
  var byExpectedDose = {};
  events.forEach(function (event) {
    var eventHomeTimeZone = event.homeTimeZone || homeTimeZone;
    var homeDay = event.localDay
      || timezone.dateKeyAt(eventHomeTimeZone, event.scheduledAt)
      || timezone.dateKeyAt("UTC", event.scheduledAt);
    if (!homeDay) return;
    var key = homeDay + ":" + event.slotId;
    var previous = byExpectedDose[key];
    var candidate = Object.assign({}, event, {
      homeTimeZone: eventHomeTimeZone,
      localDay: homeDay,
      takenTimeZone: event.takenTimeZone || event.homeTimeZone || homeTimeZone,
    });
    if (!previous || previous.outcome !== "taken" && candidate.outcome === "taken") {
      byExpectedDose[key] = candidate;
    }
  });
  return Object.keys(byExpectedDose).map(function (key) {
    return byExpectedDose[key];
  }).sort(function (left, right) {
    return left.scheduledAt - right.scheduledAt;
  });
}

/**
 * Counts scheduled events by outcome.
 * @param {Array<Object>} events - The events to classify.
 * @return {{scheduled: number, taken: number, skipped: number, noResponse: number}} Counts for each outcome category.
 */
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

/**
 * Renders an HTML card showing event outcome counts and the taken percentage.
 * @param {string} title - The card heading.
 * @param {Object} counts - Outcome counts used to calculate the percentage.
 * @returns {string} The HTML summary card.
 */
function summaryCard(title, counts) {
  var percentage = counts.scheduled === 0
    ? "—"
    : Math.round(counts.taken * 100 / counts.scheduled) + "%";
  return "<section class=card><h2>" + escapeHtml(title) + "</h2>"
    + "<div class=percentage>" + percentage + "</div>"
    + "<p><strong>" + counts.taken + "</strong> taken · "
    + "<strong>" + (counts.scheduled - counts.taken) + "</strong> not taken</p></section>";
}

/**
 * Converts an outcome value into its display label.
 * @param {*} outcome - The outcome value to label.
 * @return {string} The corresponding display label.
 */
function outcomeLabel(outcome) {
  if (outcome === "taken") {
    return "Taken";
  }
  return "Not taken";
}

/**
 * Renders reminder outcomes grouped by local day as expandable HTML detail sections.
 * @param {Array} events - Reminder outcome events to include.
 * @param {Array<Object>} zones - Normalised zone objects; the first supplies Home context for local-day groups and enabled zones supply Taken-time choices.
 * @return {string} HTML containing daily outcome details, or an empty-state message when no events are provided.
 */
function dailyDetails(events, zones) {
  var homeZone = zones[0];
  var enabledZones = zones.filter(function (zone) { return zone.enabled; });
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
      var eventHomeTimeZone = event.homeTimeZone || homeZone.timeZone;
      var time = timezone.timeLabelAt(eventHomeTimeZone, event.scheduledAt) || "—";
      var takenTime = "—";
      if (event.outcome === "taken" && event.answeredAt) {
        var selectedZone = event.takenTimeZone || homeZone.timeZone;
        if (!enabledZones.some(function (zone) { return zone.timeZone === selectedZone; })) {
          selectedZone = homeZone.timeZone;
        }
        var identity = event.installId + ":" + event.sequence;
        var zoneOptions = enabledZones.map(function (zone) {
          var zoneDay = timezone.dateKeyAt(zone.timeZone, event.answeredAt);
          var zoneTime = timezone.timeLabelAt(zone.timeZone, event.answeredAt);
          return "<option value='" + escapeHtml(zone.timeZone) + "'"
            + (zone.timeZone === selectedZone ? " selected" : "") + ">"
            + escapeHtml(zone.label + " — " + zoneDay + " " + zoneTime)
            + "</option>";
        }).join("");
        takenTime = "<select class=taken-zone data-identity='" + escapeHtml(identity)
          + "' data-initial='" + escapeHtml(selectedZone) + "'>"
          + zoneOptions + "</select>";
      }
      return "<tr><th scope=row>Pill " + (event.slotId + 1) + "</th><td>"
        + escapeHtml(time) + "</td><td>" + escapeHtml(outcomeLabel(event.outcome))
        + "</td><td>" + takenTime + "</td></tr>";
    }).join("");
    return "<details><summary><strong>" + escapeHtml(day) + "</strong> — "
      + counts.taken + "/" + counts.scheduled + " taken</summary>"
      + "<table><thead><tr><th>Pill</th><th>Home time</th><th>Status</th><th>Taken time</th></tr></thead>"
      + "<tbody>" + rows + "</tbody></table></details>";
  }).join("");
}

/**
 * Builds an HTML card displaying the current reminder settings.
 * @param {Object} settings - The settings snapshot containing reminder slots and hour-format preferences.
 * @return {string} The rendered settings card HTML.
 */
function settingsSection(settings) {
  var fallbackSlots = [8, 12, 18, 22].map(function (hour, id) {
    return { id: id, hour: hour, minute: 0, enabled: true };
  });
  var slots = settings && Array.isArray(settings.slots)
    ? settings.slots
    : fallbackSlots;
  var display = settings && settings.display ? settings.display : {
    horizontal: 1,
    vertical: 1,
    fontSize: 2,
    textColor: 0,
    backgroundColor: 1,
  };
  var zones = normaliseZones(settings);
  var timeZones = timezone.supportedTimeZones();
  function options(values, selected) {
    return values.map(function (entry) {
      return "<option value=" + entry[0]
        + (entry[0] === selected ? " selected" : "") + ">"
        + escapeHtml(entry[1]) + "</option>";
    }).join("");
  }
  zones.forEach(function (zone) {
    if (timeZones.indexOf(zone.timeZone) === -1) timeZones.unshift(zone.timeZone);
  });
  var timeZoneDatalist = "<datalist id=timezone-options>" + timeZones.map(function (zone) {
    return "<option value='" + escapeHtml(zone) + "'>";
  }).join("") + "</datalist>";
  var reminderRows = slots.map(function (slot, index) {
    return "<div class='reminder configurable-row' id=slot-row-" + index
      + (slot.enabled ? "" : " hidden") + "><label for=slot-" + index + "-time>Pill "
      + (index + 1) + "</label><input id=slot-" + index
      + "-time type=time required value='" + pad2(slot.hour) + ":"
      + pad2(slot.minute) + "'><label class=toggle><input id=slot-" + index
      + "-enabled type=checkbox" + (slot.enabled ? " checked" : "")
      + " onchange=hideUnchecked('slot'," + index + ")> Enabled</label></div>";
  }).join("");
  var colors = [
    [0, "White"], [1, "Black"], [2, "Red"], [3, "Orange"],
    [4, "Yellow"], [5, "Green"], [6, "Cyan"], [7, "Blue"],
    [8, "Purple"], [9, "Magenta"],
  ];
  var zoneRows = zones.map(function (zone, index) {
    var enabledControl = index === 0
      ? "<input id=zone-0-enabled type=hidden value=1>"
      : "<label class=toggle><input id=zone-" + index + "-enabled type=checkbox"
        + (zone.enabled ? " checked" : "") + " onchange=hideUnchecked('zone'," + index
        + ")> Displayed</label>";
    var heading = index === 0 ? "Home — " + zone.label : zone.label;
    return "<div class='timezone configurable-row' id=zone-row-" + index
      + (zone.enabled ? "" : " hidden") + "><h3>" + escapeHtml(heading)
      + "</h3>" + enabledControl + "<label for=zone-" + index + "-time-zone>Timezone</label>"
      + "<input id=zone-" + index + "-time-zone list=timezone-options value='"
      + escapeHtml(zone.timeZone) + "' onchange=updateZoneLabel(" + index
      + ")><label for=zone-" + index + "-label>Label</label>"
      + "<input id=zone-" + index + "-label type=text maxlength=8 pattern='[A-Za-z0-9 ]{1,8}' value='"
      + escapeHtml(zone.label) + "'><label for=zone-" + index + "-text-color>Text colour</label>"
      + "<select id=zone-" + index + "-text-color>" + options(colors, zone.textColor) + "</select>"
      + "<label for=zone-" + index + "-background-color>Background colour</label>"
      + "<select id=zone-" + index + "-background-color>" + options(colors, zone.backgroundColor)
      + "</select></div>";
  }).join("");
  return "<section class=card><h2>Watch settings</h2>"
    + "<p class=muted>Saved settings transfer to watch, then refresh this report.</p>"
    + "<p class=muted>Time format follows the watch's 12/24-hour system setting.</p>"
    + "<fieldset><legend>Reminders</legend>" + reminderRows
    + "<button type=button onclick=addRow('slot')>+ Add reminder</button></fieldset>"
    + "<fieldset><legend>Timezones</legend>"
    + "<p class=muted>Home is default. Up/Down cycles only displayed timezone labels.</p>"
    + zoneRows + timeZoneDatalist + "<button type=button onclick=addRow('zone')>+ Add timezone</button>"
    + "<p class=muted>Phone refreshes daylight-saving data whenever bridge connects. "
    + "Watch stores next transitions for offline use.</p></fieldset>"
    + "<fieldset><legend>Text position</legend><label for=horizontal>Horizontal</label>"
    + "<select id=horizontal>" + options([[0, "Left"], [1, "Center"], [2, "Right"]], display.horizontal) + "</select>"
    + "<label for=vertical>Vertical</label><select id=vertical>"
    + options([[0, "Top"], [1, "Middle"], [2, "Bottom"]], display.vertical) + "</select></fieldset>"
    + "<fieldset><legend>Watchface</legend><label for=font-size>Font size</label>"
    + "<select id=font-size>" + options([[0, "Small"], [1, "Medium"], [2, "Large"]], display.fontSize) + "</select>"
    + "</fieldset>"
    + "<button class=save onclick=saveSettings()>Save settings</button></section>";
}

exports.buildReportPage = function buildReportPage(state) {
  var now = Date.now();
  var zones = normaliseZones(state.settings);
  var reportEvents = expectedEvents(state.events, zones[0].timeZone);
  var todayKey = timezone.dateKeyAt(zones[0].timeZone, now) || localDay(new Date(now));
  var todayOrdinal = dayOrdinal(todayKey);
  function eventsWithinHomeDays(dayCount) {
    return reportEvents.filter(function (event) {
      var eventOrdinal = dayOrdinal(event.localDay);
      return eventOrdinal !== null
        && todayOrdinal !== null
        && eventOrdinal <= todayOrdinal
        && eventOrdinal > todayOrdinal - dayCount;
    });
  }
  var thirtyDayEvents = eventsWithinHomeDays(30);
  var sevenDayEvents = eventsWithinHomeDays(7);
  var todayEvents = reportEvents.filter(function (event) {
    return event.localDay === todayKey;
  });

  var lastSync = state.lastSyncAt
    ? new Date(state.lastSyncAt).toLocaleString()
    : "Never";
  var stale = !state.lastSyncAt || now - state.lastSyncAt > 24 * 60 * 60 * 1000;
  var warning = "";
  if (stale) {
    warning += "<p class=warning>Report may be stale. Open Number Watch on watch to sync.</p>";
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
    + "table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 4px;border-bottom:1px solid #e7ecf2;vertical-align:top}"
    + "summary{cursor:pointer}.empty{padding:15px;background:#fff;border-radius:12px}"
    + "fieldset{border:0;padding:0;margin:18px 0}legend{font-weight:700;margin-bottom:8px}"
    + "label{display:block;font-weight:600;margin:10px 0 5px}select,input[type=time],input[type=text]{box-sizing:border-box;width:100%;font-size:17px;padding:10px;border:1px solid #aab6c4;border-radius:8px;background:#fff}"
    + ".reminder{display:grid;grid-template-columns:1fr 1.2fr;gap:4px 12px;align-items:end;margin:10px 0}.reminder label{margin:0}.toggle{font-weight:400}input[type=checkbox]{width:auto}.timezone{border-top:1px solid #e7ecf2;padding-top:10px;margin-top:12px}.timezone h3{margin:0}[hidden]{display:none!important}.taken-zone{min-width:180px}"
    + "button{width:100%;padding:13px;margin:8px 0;border:0;border-radius:10px;font-size:17px;font-weight:600}"
    + ".save{background:#1e6b91;color:#fff}.danger{background:#b42318;color:#fff}.close{background:#dce8f4;color:#172033}"
    + "</style></head><body><main><h1>Pill Reminder</h1>"
    + "<p class=sync>Last synced: " + escapeHtml(lastSync) + "</p>"
    + warning
    + summaryCard("Today", countOutcomes(todayEvents))
    + summaryCard("Last 7 days", countOutcomes(sevenDayEvents))
    + summaryCard("Last 30 days", countOutcomes(thirtyDayEvents))
    + settingsSection(state.settings)
    + "<section><h2>Taken list</h2>" + dailyDetails(thirtyDayEvents, zones)
    + "<button type=button onclick=saveTakenZones()>Save taken timezones</button></section>"
    + "<p class=muted>Taken means self-reported. Not taken means no Taken response; it does not prove a missed dose. "
    + "This report is not a medical record.</p>"
    + "<button class=danger onclick=clearHistory()>Clear phone report</button>"
    + "<button class=close onclick=closeReport()>Close</button>"
    + "<script>function closeWith(v){location.href='pebblejs://close#'+encodeURIComponent(JSON.stringify(v))}"
    + "function hideUnchecked(kind,index){var enabled=document.getElementById(kind+'-'+index+'-enabled');if(enabled&&!enabled.checked)document.getElementById(kind+'-row-'+index).hidden=true}"
    + "function addRow(kind){var start=kind==='zone'?1:0;var limit=kind==='zone'?" + TIMEZONE_COUNT + ":4;for(var i=start;i<limit;i++){var row=document.getElementById(kind+'-row-'+i);if(row.hidden){row.hidden=false;document.getElementById(kind+'-'+i+'-enabled').checked=true;return}}alert(kind==='zone'?'Maximum four timezones including Home.':'Maximum four reminders.')}"
    + "function saveSettings(){var slots=[];for(var i=0;i<4;i++){var p=document.getElementById('slot-'+i+'-time').value.split(':');if(p.length!==2){alert('Set all reminder times.');return;}slots.push({id:i,hour:parseInt(p[0],10),minute:parseInt(p[1],10),enabled:document.getElementById('slot-'+i+'-enabled').checked});}for(var l=0;l<4;l++){if(!slots[l].enabled)continue;for(var r=l+1;r<4;r++){if(!slots[r].enabled)continue;var gap=Math.abs((slots[l].hour*60+slots[l].minute)-(slots[r].hour*60+slots[r].minute));gap=Math.min(gap,1440-gap);if(gap<2){alert('Enabled reminders need at least a two minute gap.');return;}}}var zones=[];for(var z=0;z<" + TIMEZONE_COUNT + ";z++){var label=document.getElementById('zone-'+z+'-label').value.trim().toUpperCase();if(!/^[A-Z0-9 ]{1,8}$/.test(label)){alert('Timezone labels need 1-8 letters, numbers, or spaces.');return;}zones.push({id:z,enabled:z===0||document.getElementById('zone-'+z+'-enabled').checked,timeZone:document.getElementById('zone-'+z+'-time-zone').value,label:label,textColor:parseInt(document.getElementById('zone-'+z+'-text-color').value,10),backgroundColor:parseInt(document.getElementById('zone-'+z+'-background-color').value,10)});}closeWith({action:'save_settings',display:{horizontal:parseInt(document.getElementById('horizontal').value,10),vertical:parseInt(document.getElementById('vertical').value,10),fontSize:parseInt(document.getElementById('font-size').value,10),textColor:zones[0].textColor,backgroundColor:zones[0].backgroundColor},zones:zones,slots:slots})}"
    + "function clearHistory(){if(confirm('Clear phone report history? This cannot be undone.'))closeWith({action:'clear_history'})}"
    + "function closeReport(){closeWith({action:'close'})}"
    + "function updateZoneLabel(index){var value=document.getElementById('zone-'+index+'-time-zone').value;var p=value.split('/');document.getElementById('zone-'+index+'-label').value=p[p.length-1].replace(/_/g,' ').toUpperCase().replace(/[^A-Z0-9 ]/g,'').slice(0,8)}"
    + "function saveTakenZones(){var nodes=document.querySelectorAll('.taken-zone');var events=[];for(var i=0;i<nodes.length;i++){if(nodes[i].value!==nodes[i].getAttribute('data-initial'))events.push({identity:nodes[i].getAttribute('data-identity'),timeZone:nodes[i].value})}closeWith({action:'update_taken_zones',events:events})}"
    + "</script>"
    + "</main></body></html>";
};
