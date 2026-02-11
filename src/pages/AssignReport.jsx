import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { syncReports } from "../lib/sync";

export default function AssignReport() {
  const [reports, setReports] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [selectedTech, setSelectedTech] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // // Re-sync when back online
    // const handleOnline = () => {
    //   syncReports();
    //   loadData();
    // };

    // window.addEventListener("online", handleOnline);
    // return () => window.removeEventListener("online", handleOnline);
  }, []);

  // --------------------------
  // LOAD REPORTS + TECHNICIANS
  // --------------------------
  async function loadData() {
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    // Fetch unassigned reports online
    if (navigator.onLine) {
      const { data: reportsData, error: repErr } = await supabase
        .from("reports")
        .select("*")
        .eq("status", "Submitted")
        .order("created_at", { ascending: false });

      if (repErr) console.error(repErr);
      else setReports(reportsData || []);
    }
    else {
      // OFFLINE fallback
      const offline = await db.reports
        .where("status")
        .equals("Submitted")
        .toArray();
      setReports(offline || []);
    }

    // Fetch list of technicians
    const { data: techData, error: techErr } = await supabase
      .from("user_profiles")
      .select("id, full_name")
      .eq("role", "technician");

    if (techErr) console.error(techErr);
    else setTechnicians(techData || []);

    setLoading(false);
  }

  // --------------------------
  // ASSIGN ACTION (offline-first)
  // --------------------------
  async function handleAssign(reportId) {
    const technicianId = selectedTech[reportId];

    if (!technicianId) return alert("Please select technician");

    const { data: { session } } = await supabase.auth.getSession();
    const manager = session.user;

    let report = await db.reports.get(reportId);
    if (!report) {
      if (!navigator.onLine) {
        alert("Report not found locally. Please go online and try again.");
        return;
      }

      const { data: onlineReport, error: onlineErr } = await supabase
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .single();

      if (onlineErr || !onlineReport) {
        console.error(onlineErr);
        alert("Report not found. Please sync and try again.");
        return;
      }

      await db.reports.put({ ...onlineReport, synced: true });
      report = onlineReport;
    }
    const oldStatus = report.status || "Submitted";

    // --------------------------
    // Build local status change entry
    // --------------------------
    const historyEntry = {
      old_status: oldStatus,
      new_status: "New",
      changed_by: manager.id,
      changed_by_name: manager.email,
      changed_at: new Date().toISOString()
    };

    const existingChanges = report._status_changes || [];

    // --------------------------
    // 1) Update Dexie offline
    // --------------------------
    await db.reports.update(reportId, {
      assigned_to: technicianId,
      assigned_at: new Date().toISOString(),
      status: "New",
      updated_at: new Date().toISOString(),
      updated_by: manager.id,
      synced: false,
      _status_changes: [...existingChanges, historyEntry]
    });

    console.log("historyEntry:", historyEntry);

    // --------------------------
    // 2) Online update if available
    // --------------------------
    if (navigator.onLine) {
      const { error } = await supabase
        .from("reports")
        .update({
          assigned_to: technicianId,
          assigned_at: new Date().toISOString(),
          status: "New",
          updated_at: new Date().toISOString(),
          updated_by: manager.id
        })
        .eq("id", reportId);

      if (error) {
        console.error(error);
        alert("Assigned offline — will sync later");
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

    alert("✔ Assigned Successfully");

    // --------------------------
    // 3) Trigger sync & reload
    // --------------------------
    syncReports();
    loadData();

  }

  if (loading) return <p className="p-6">Loading reports…</p>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📋 Assign Reports</h1>

      {reports.length === 0 && (
        <p className="text-gray-500">No reports pending assignment</p>
      )}

      <div className="grid gap-5">
        {reports.map((r) => (
          <div key={r.id} className="p-4 bg-white shadow rounded-lg border">
            <p className="font-bold text-lg">{r.title || "Untitled Report"}</p>
            <p className="text-sm text-gray-600">{r.description}</p>

            <div className="text-sm text-gray-500 mt-1">
              Submitted by: {r.user_id}
            </div>

            <div className="flex gap-3 mt-3">
              <select
                className="border p-2 rounded w-full"
                value={selectedTech[r.id] || ""}
                onChange={(e) =>
                  setSelectedTech({
                    ...selectedTech,
                    [r.id]: e.target.value
                  })
                }
              >
                <option value="">Select technician</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name || t.id}
                  </option>
                ))}
              </select>

              <button
                onClick={() => handleAssign(r.id)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
              >
                Assign
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
