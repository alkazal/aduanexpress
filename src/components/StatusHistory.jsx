export default function StatusHistory({ history = [] }) {
  if (!history || history.length === 0) {
    return (
      <div>
        <h3 className="text-lg font-semibold mb-2">Status History</h3>
        <p className="text-gray-500 text-sm">No status changes yet.</p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold mb-2">Status History</h3>

      <div className="space-y-3">
        {history.map((h, i) => (
          <div key={h.id || `${i}-${h.changed_at}`} className="flex items-start gap-3">
            <div className="w-3 h-3 rounded-full bg-blue-600 mt-1" />
            <div>
              <div className="text-sm font-medium">
                {h.old_status} → {h.new_status}
              </div>

              <div className="text-xs text-gray-500">
                {new Date(h.changed_at).toLocaleString()}
              </div>

              <div className="text-xs text-gray-600">
                By: {h.user_profiles?.full_name || h.changed_by_name || h.changed_by || "Unknown"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
