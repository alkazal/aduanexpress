import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { syncReports } from "../lib/sync";
import { useNavigate } from "react-router-dom";

export default function ManagerCloseReport() {
  const [reports, setReports] = useState([]);
  const [closeNotes, setCloseNotes] = useState({});
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    loadReports();

    const handleOnline = () => {
      syncReports();
      loadReports();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  // -------------------------------------------
  // Load all "Resolved" reports (online + offline)
  // -------------------------------------------
  async function loadReports() {
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return navigate("/login");

    let results = [];

    if (navigator.onLine) {
      const { data, error } = await supabase
        .from("reports")
        .select(`
          *,
          assigned_to_profile:assigned_to ( full_name ),
          created_by_profile:user_id ( full_name )
        `)
        .eq("status", "Resolved")
        .order("updated_at", { ascending: false });

      if (!error && data) results = data;
    } else {
      // Offline fallback
      results = await db.reports
        .where("status")
        .equals("Resolved")
        .toArray();
    }

    setReports(results);
    setLoading(false);
  }

  // -------------------------------------------
  // Close Report (Offline-first)
  // -------------------------------------------
  async function closeReport(report) {
    const closingNote = closeNotes[report.id];

    if (!closingNote || closingNote.trim() === "") {
      alert("Please enter closing notes before closing");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const manager = session.user;
    const now = new Date().toISOString();

    const historyEntry = {
      old_status: "Resolved",
      new_status: "Closed",
      changed_by: manager.id,
      changed_by_name: manager.email,
      changed_at: now,
      comment: closingNote
    };

    const existingHistory = report._status_changes || [];

    // 1️⃣ Update Dexie first
    await db.reports.update(report.id, {
      status: "Closed",
      closing_notes: closingNote,
      closed_at: now,
      updated_at: now,
      updated_by: manager.id,
      synced: false,
      _status_changes: [...existingHistory, historyEntry]
    });

    // 2️⃣ Push to Supabase if online
    if (navigator.onLine) {
      const { error } = await supabase
        .from("reports")
        .update({
          status: "Closed",
          closing_notes: closingNote,
          closed_at: now,
          updated_at: now,
          updated_by: manager.id
        })
        .eq("id", report.id);

      if (error) {
        console.error("Close error:", error);
        alert("Closed offline — will sync later");
      }
      if (!error) {
        const { error: historyError } = await supabase
          .from("report_status_history")
          .insert({
            report_id: report.id,
            old_status: historyEntry.old_status,
            new_status: historyEntry.new_status,
            changed_by: historyEntry.changed_by,
            changed_by_name: historyEntry.changed_by_name,
            changed_at: historyEntry.changed_at,
            comment: historyEntry.comment
          });

        if (historyError) {
          console.error("History insert failed:", historyError);
        }
        // Mark local row synced to avoid duplicate UPSERT later
        await db.reports.update(report.id, {
          synced: true,
          ...(historyError ? {} : { _status_changes: [] })
        });
      }
    }

    alert("✔ Report closed successfully");
    syncReports();
    loadReports();
  }

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📕 Close Reports</h1>

      {reports.length === 0 && (
        <p className="text-gray-500">No reports waiting for closure</p>
      )}

      <div className="space-y-5">
        {reports.map((r) => (
          <div key={r.id} className="bg-white shadow p-4 rounded-lg border">
            <p className="text-sm text-gray-500">{r.ticket_no}</p>

            <h2 className="font-semibold text-lg">{r.title}</h2>
            <p className="text-gray-700">{r.description}</p>

            <div className="text-sm text-gray-500 mt-2">
              Assigned to:{" "}
              <b>{r.assigned_to_profile?.full_name || r.assigned_to}</b>
            </div>

            <div className="text-sm text-gray-500">
              Reported by:{" "}
              <b>{r.created_by_profile?.full_name || r.user_id}</b>
            </div>

            {/* Closing Notes */}
            <label className="block mt-4 font-semibold text-sm">
              Closing Notes
            </label>
            <textarea
              rows={3}
              className="border w-full p-2 rounded"
              placeholder="Enter final resolution details..."
              value={closeNotes[r.id] || ""}
              onChange={(e) =>
                setCloseNotes({
                  ...closeNotes,
                  [r.id]: e.target.value
                })
              }
            />

            <div className="flex justify-end mt-4">
              <button
                onClick={() => closeReport(r)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
              >
                Close Report
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
