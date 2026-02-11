import { useEffect, useState } from "react";
import { setSyncStatusListener } from "../lib/syncEvents";

export default function SyncStatus() {
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    // Listen to sync events
    setSyncStatusListener((newStatus) => {
      setStatus(newStatus);
    });
  }, []);

  if (status === "idle") return null;

  return (
    <div className="fixed bottom-4 right-4 px-4 py-2 text-white rounded shadow-lg text-sm 
      transition-all duration-300"
      style={{
        background:
          status === "syncing" ? "#2563eb" :
          status === "done" ? "#16a34a" :
          status === "nosession" ? "#f59e0b" :
          "#6b7280"
      }}
    >
      {status === "syncing" && "🔄 Syncing..."}
      {status === "done" && "✅ All data synced"}
      {status === "nosession" && "⚠️ Login required to sync"}
      {status === "offline" && "📴 Offline mode — waiting to sync"}
    </div>
  );
}
