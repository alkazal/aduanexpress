import { Badge } from "./ui/badge";

const STATUS_CLASS = {
  Open: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  Pending: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  Resolved: "bg-green-100 text-green-700 hover:bg-green-100",
  New: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  Closed: "bg-gray-100 text-gray-700 hover:bg-gray-100",
};

export default function StatusBadge({ status, className = "" }) {
  const tone = STATUS_CLASS[status] || "bg-gray-100 text-gray-600 hover:bg-gray-100";

  return (
    <Badge variant="secondary" className={`${tone} ${className}`.trim()}>
      {status || "Unknown"}
    </Badge>
  );
}
