/**
 * Wraps the host timer functions with consistent guards.
 * Handles are unref'd where supported so Node-based tests can exit, and
 * cancelling tolerates null handles and hosts without clearTimeout.
 * @param {function(function, number): *} setTimer - Host setTimeout.
 * @param {?function(*)} clearTimer - Host clearTimeout, if available.
 * @return {{start: function(function, number): *, cancel: function(*)}} Timer helpers.
 */
function createTimers(setTimer, clearTimer) {
  return {
    start: function (callback, delay) {
      var handle = setTimer(callback, delay);
      if (handle && typeof handle.unref === "function") handle.unref();
      return handle;
    },
    cancel: function (handle) {
      if (handle !== null && handle !== undefined && typeof clearTimer === "function") {
        clearTimer(handle);
      }
    },
  };
}

exports.createTimers = createTimers;
