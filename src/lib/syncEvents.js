// syncEvents.js
// A lightweight event emitter for sync status + individual report sync messages

let syncStatusCallback = null;
let reportSyncedCallback = null;

/* ---------------------------------------------
 *   SYNC STATUS:
 *   "syncing", "done", "error", "login_required"
 * --------------------------------------------- */
export function setSyncStatusListener(callback) {
  syncStatusCallback = callback;
}

export function emitSyncStatus(status) {
  if (syncStatusCallback) {
    syncStatusCallback(status);
  }
}

/* ---------------------------------------------
 *   REPORT SYNCED EVENT:
 *   Emitted when a single report finishes syncing
 * --------------------------------------------- */
export function setReportSyncedListener(callback) {
  reportSyncedCallback = callback;
}

export function emitReportSynced(reportTitle) {
  if (reportSyncedCallback) {
    reportSyncedCallback(reportTitle);
  }
}

/* ---------------------------------------------
 *   Optional cleanup function
 * --------------------------------------------- */
export function clearSyncListeners() {
  syncStatusCallback = null;
  reportSyncedCallback = null;
}
