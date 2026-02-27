import { useEffect } from "react";

export default function Toast({ message, type = "success", duration = 3000, onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(), duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!message) return null;

  return (
    <div className={`fixed bottom-5 right-5 text-white px-4 py-2 rounded shadow-lg z-50 ${type === "error" ? "bg-red-600" : "bg-green-600"}`}>
      {message}
    </div>
  );
}
