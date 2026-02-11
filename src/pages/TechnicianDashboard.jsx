import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { useNavigate } from "react-router-dom";
import { syncReports } from "../lib/sync";

function statusColor(status) {
  if (status === "Open") return "text-yellow-600";
  if (status === "Pending") return "text-orange-600";
  if (status === "Resolved") return "text-green-600";
  return "text-gray-600";
}

export default function TechnicianDashboard() {
  const [reports, setReports] = useState([]);
  const [statusUpdates, setStatusUpdates] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadReports();

    const handleOnline = () => {
      console.log("Online - syncing technician updates");
      syncReports();   // Your existing sync system
      loadReports();
    };

    window.addEventListener("online", handleOnline);

    return () => window.removeEventListener("online", handleOnline);
  }, []);

  async function loadReports() {
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return navigate("/login");
    
    // ---- ONLINE ----
    if (navigator.onLine) {
      const { data, error } = await supabase
        .from("reports")
        .select("*")
        .eq("assigned_to", user.id)
        .order("assigned_at", { ascending: false });

      if (!error) setReports(data || []);
    } 
    // ---- OFFLINE ----
    else {
      const offline = await db.reports
        .where("assigned_to")
        .equals(user.id)
        .toArray();

      setReports(offline || []);
    }

    setLoading(false);
  }

  // --------------------------
  // UPDATE STATUS (offline-first)
  // --------------------------
  async function updateStatus(reportId) {
    const newStatus = statusUpdates[reportId];

    if (!newStatus) {
      alert("Please select a new status");
      return;
    }

    if (newStatus === reports.find(r => r.id === reportId)?.status) {
       alert("Status is already set to this value");
        return;
    }

    // // ✅ Allowed: Open, Pending, Resolved (manager only can close)
    // if (!["Open", "Pending", "Resolved"].includes(newStatus)) {
    //   alert("Invalid status");
    //   return;
    // }

    const current = reports.find(r => r.id === reportId);
    if (!current) return;

    if (current.status === newStatus) {
      alert("Already set to this status");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const user = session.user;
    //const now = new Date().toISOString();

    // --------------------------
    // 1) Push local status history
    // --------------------------
    const historyEntry = {
      old_status: current.status,
      new_status: newStatus,
      changed_by: user.id,
      changed_by_name: user.email || user.full_name || user.id,
      changed_at: new Date().toISOString()
    };

    const existing = current._status_changes || [];

    // --------------------------
    // 2) Update Dexie offline
    // --------------------------
    await db.reports.update(reportId, {
      status: newStatus,
      updated_at: new Date().toISOString(),
      updated_by: user.id,
      synced: false,
      _status_changes: [...existing, historyEntry]
      //_status_changes: (await db.reports.get(reportId))._status_changes ? [...(await db.reports.get(reportId))._status_changes, historyEntry] : [historyEntry]
    });
    // END FOR LOG HISTORY

    
    // --------------------------
    // 3) Attempt to update Supabase immediately if online
    // --------------------------
    if (navigator.onLine) {
      const { error } = await supabase
        .from("reports")
        .update({
          status: newStatus,
          updated_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", reportId);

      if (error) {
        console.error("SUPABASE UPDATE ERROR:", error);
        alert("Offline saved — will sync later");
        return;
      }
      if (!error) {
        const { error: historyError } = await supabase
          .from("report_status_history")
          .insert({
            report_id: reportId,
            old_status: historyEntry.old_status,
            new_status: historyEntry.new_status,
            changed_by: historyEntry.changed_by,
            changed_by_name: historyEntry.changed_by_name,
            changed_at: historyEntry.changed_at
          });

        if (historyError) {
          console.error("History insert failed:", historyError);
        }
        // Mark local row synced to avoid duplicate UPSERT later
        await db.reports.update(reportId, {
          synced: true,
          ...(historyError ? {} : { _status_changes: [] })
        });
      }
    }

    alert("✅ Status updated");
    loadReports();
  }

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">🔧 My Assigned Tickets</h1>

      {reports.length === 0 && (
        <p className="text-gray-500">No assigned reports</p>
      )}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((r) => (
          <div key={r.id} className="bg-white shadow rounded-lg p-4 border">
            <p className="text-sm text-gray-500">{r.ticket_no}</p>
            <p className="font-semibold text-lg">{r.title}</p>
            <p className="text-gray-600">{r.description}</p>

            <p className="text-sm mt-2">
              <b>Status:</b>{" "}
              <span className={`font-semibold ${statusColor(r.status)}`}>
                {r.status}
              </span>

            </p>

            <div className="flex gap-2 mt-4">
              <select
                className="border p-2 rounded w-full"
                value={statusUpdates[r.id] || ""}
                onChange={(e) =>
                  setStatusUpdates({
                    ...statusUpdates,
                    [r.id]: e.target.value
                  })
                }
              >
                <option value="">Change status</option>
                <option value="Open">Open</option>
                <option value="Pending">Pending</option>
                <option value="Resolved">Resolved</option>
              </select>

              <button
                onClick={() => updateStatus(r.id)}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded"
              >
                Update
              </button>
            </div>

            <button
              onClick={() => navigate(`/report/${r.id}`)}
              className="mt-3 w-full text-blue-600 text-sm underline"
            >
              View Details
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
