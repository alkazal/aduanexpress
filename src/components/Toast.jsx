import { useEffect } from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { cn } from "../lib/utils";
import { X } from "lucide-react";

export default function Toast({ message, type = "success", duration = 3000, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(), duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!message) return null;

  return (
    <Alert
      className={cn(
        "fixed bottom-5 right-5 z-50 w-auto border-0 px-4 py-3 text-white shadow-lg flex items-center justify-between gap-3",
        type === "error" ? "bg-red-600" : "bg-green-600"
      )}
      aria-live="polite"
    >
      <AlertDescription className="m-0">{message}</AlertDescription>
      <button
        onClick={onClose}
        className="flex-shrink-0 ml-2 p-1 hover:bg-white/20 rounded transition-colors"
        aria-label="Close notification"
      >
        <X className="h-4 w-4 text-white" />
      </button>
    </Alert>
  );
}
