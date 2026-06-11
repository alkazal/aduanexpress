import { useEffect, useState } from "react";
import { setSyncStatusListener } from "../lib/syncEvents";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import { X } from "lucide-react";

export default function SyncStatus() {
  const [status, setStatus] = useState("idle");
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Listen to sync events
    setSyncStatusListener((newStatus) => {
      setStatus(newStatus);
      setIsVisible(true); // Show alert when sync status changes
    });
  }, []);

  if (status === "idle" || !isVisible) return null;

  const statusConfig = {
    syncing: {
      label: "Syncing",
      message: "Syncing data now...",
      tone: "bg-blue-600",
      badge: "default",
      icon: "SYNC",
    },
    done: {
      label: "Synced",
      message: "All data synced",
      tone: "bg-green-600",
      badge: "secondary",
      icon: "OK",
    },
    nosession: {
      label: "Action Needed",
      message: "Login required to sync",
      tone: "bg-amber-500",
      badge: "outline",
      icon: "WARN",
    },
    offline: {
      label: "Offline",
      message: "Offline mode, waiting to sync",
      tone: "bg-gray-500",
      badge: "secondary",
      icon: "OFF",
    },
  };

  const current = statusConfig[status] ?? {
    label: "Sync",
    message: "Status unavailable",
    tone: "bg-gray-500",
    badge: "secondary",
    icon: "INFO",
  };

  return (
    <Alert
      className={cn(
        "fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] border-0 text-white shadow-lg transition-all duration-300 flex flex-col gap-2",
        current.tone
      )}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-[10px] font-bold tracking-wide">
            {current.icon}
          </span>
          <AlertTitle className="mb-0 text-sm text-white">{current.label}</AlertTitle>
          <Badge variant={current.badge} className="ml-auto bg-white/20 text-white hover:bg-white/20">
            {status}
          </Badge>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="flex-shrink-0 p-1 hover:bg-white/20 rounded transition-colors"
          aria-label="Close sync status"
        >
          <X className="h-4 w-4 text-white" />
        </button>
      </div>
      <AlertDescription className="text-white/90 m-0">{current.message}</AlertDescription>
    </Alert>
  );
}
