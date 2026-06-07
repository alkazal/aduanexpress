import { useEffect } from "react";
import { Alert, AlertDescription } from "./ui/alert";
import { cn } from "../lib/utils";

export default function Toast({ message, type = "success", duration = 3000, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(), duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!message) return null;

  return (
    <Alert
      className={cn(
        "fixed bottom-5 right-5 z-50 w-auto border-0 px-4 py-2 text-white shadow-lg",
        type === "error" ? "bg-red-600" : "bg-green-600"
      )}
      aria-live="polite"
    >
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
