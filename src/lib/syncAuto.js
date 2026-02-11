import { syncReports } from "./sync";

let syncing = false;

export function initAutoSync() {
  console.log("initAutoSync: registering online listener");

  // 1) Listen when the browser goes online
  window.addEventListener("online", async () => {
    console.log("Browser is online → triggering syncReports()");
    triggerSync();
  });

  // 2) If already online when app loads → run sync once
  if (navigator.onLine) {
    console.log("App started online → triggering initial syncReports()");
    triggerSync();
  }
}

async function triggerSync() {
  if (syncing) {
    console.log("Sync already running → skipping");
    return;
  }

  syncing = true;
  console.log("Starting sync...");
  try {
    await syncReports();
  } catch (err) {
    console.error("Auto sync failed:", err);
  } finally {
    syncing = false;
    console.log("Sync completed");
  }
}
