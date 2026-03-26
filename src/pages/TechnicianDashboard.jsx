import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { useNavigate } from "react-router-dom";
import { syncReports } from "../lib/sync";

import {
  Inbox,
  Clock,
  AlertCircle,
  CheckCircle
} from "lucide-react";

export default function TechnicianDashboard() {
  const [reports, setReports] = useState([]);
  const [statusUpdates, setStatusUpdates] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [levelUpdates, setLevelUpdates] = useState({});
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
        .select(`
          *,
          project:project_id ( name )
        `)
        .eq("assigned_to", user.id)
        .order("assigned_at", { ascending: false });

      if (!error) {
        const list = (data || []).map((r) => ({
          ...r,
          project_name: r.project?.name || r.project_name || null
        }));
        setReports(list);
      }
    } 
    // ---- OFFLINE ----
    else {
      const offline = await db.reports
        .where("assigned_to")
        .equals(user.id)
        .toArray();

      const list = await Promise.all(
        (offline || []).map(async (r) => {
          if (r.project_name || !r.project_id) return r;
          const proj = await db.projects.get(r.project_id);
          return {
            ...r,
            project_name: proj?.name || null
          };
        })
      );

      setReports(list);
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

  const projectOptions = Array.from(
    new Set(reports.map((r) => r.project_name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const filteredReports = reports.filter((r) => {
    const matchProject = selectedProject
      ? r.project_name === selectedProject
      : true;

    const createdDate = new Date(r.created_at).toISOString().slice(0, 10);
    const matchStart = startDate ? createdDate >= startDate : true;
    const matchEnd = endDate ? createdDate <= endDate : true;

    return matchProject && matchStart && matchEnd;
  });

  const statusCounts = {
    OPEN: filteredReports.filter(r => r.status === "Open").length,
    PENDING: filteredReports.filter(r => r.status === "Pending").length,
    RESOLVED: filteredReports.filter(r => r.status === "Resolved").length
  };

  function statusColor(status) {
    if (status === "Open")
      return "bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full";

    if (status === "Pending")
      return "bg-orange-100 text-orange-700 px-2 py-1 rounded-full";

    if (status === "Resolved")
      return "bg-green-100 text-green-700 px-2 py-1 rounded-full";

    return "bg-gray-100 text-gray-700 px-2 py-1 rounded-full";
  }

  async function updateReport(reportId) {
    const newStatus = statusUpdates[reportId];
    const newLevel = levelUpdates[reportId];

    const current = reports.find(r => r.id === reportId);
    if (!current) return;

    // If nothing changed
    if (
      (!newStatus || newStatus === current.status) &&
      (!newLevel || Number(newLevel) === Number(current.maintenance_level))
    ) {
      alert("No changes made");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const user = session.user;

    // --------------------------
    // Build update object
    // --------------------------
    const updates = {
      updated_at: new Date().toISOString(),
      updated_by: user.id,
      synced: false
    };

    if (newStatus && newStatus !== current.status) {
      updates.status = newStatus;
    }

    if (newLevel && Number(newLevel) !== Number(current.maintenance_level)) {
      updates.maintenance_level = Number(newLevel);
    }

    // --------------------------
    // History (ONLY for status)
    // --------------------------
    let historyEntry = null;

    if (updates.status) {
      historyEntry = {
        old_status: current.status,
        new_status: updates.status,
        changed_by: user.id,
        changed_by_name: user.email || user.id,
        changed_at: new Date().toISOString()
      };

      updates._status_changes = [
        ...(current._status_changes || []),
        historyEntry
      ];
    }

    // --------------------------
    // 1) Update Dexie
    // --------------------------
    await db.reports.update(reportId, updates);

    // --------------------------
    // 2) Try Supabase
    // --------------------------
    if (navigator.onLine) {
      const { error } = await supabase
        .from("reports")
        .update(updates)
        .eq("id", reportId);

      if (error) {
        console.error(error);
        alert("Saved offline — will sync later");
        return;
      }

      // Insert history if needed
      if (historyEntry) {
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
      }

      await db.reports.update(reportId, {
        synced: true,
        ...(historyEntry ? { _status_changes: [] } : {})
      });
    }

    alert("✅ Updated successfully");
    loadReports();
  }

  return (
    <div className="p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div className="w-full sm:w-auto">
          <h1 className="text-2xl font-bold">Technician Dashboard</h1>
          <p className="text-gray-500 text-sm">
            Update your personal information 
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 w-full max-w-2xl">
          <div className="w-full sm:flex-1">
            <select
              className="w-full border border-border-light rounded-md p-2 text-sm"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
            <option value="">All Projects</option>
            {projectOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>  

          <div className="w-full sm:w-auto flex flex-col">
          <label className="text-xs font-semibold text-gray-700 mb-1">
            Start Date
          </label>
          <input
            type="date"
            className="border border-border-light rounded-md p-2 text-sm"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Start date"
          />
          </div>

          <div className="w-full sm:w-auto flex flex-col">
          <label className="text-xs font-semibold text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            className="border border-border-light rounded-md p-2 text-sm"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="End date"
          />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

        {/* Assigned Tickets */}
        <div className="bg-white shadow rounded-lg p-4 flex justify-between items-start">

          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-500">Assigned Tickets</p>
            <p className="text-3xl font-bold text-gray-700">
              {filteredReports.length}
            </p>
          </div>

          <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
            <Inbox className="h-6 w-6 text-blue-600" />
          </div>

        </div>

        {/* Open */}
        <div className="bg-white shadow rounded-lg p-4 flex justify-between items-start">

          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-500">Open</p>
            <p className="text-3xl font-bold text-gray-700">
              {statusCounts.OPEN}
            </p>
          </div>

          <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
            <Clock className="h-6 w-6 text-purple-600" />
          </div>

        </div>

        {/* Pending */}
        <div className="bg-white shadow rounded-lg p-4 flex justify-between items-start">

          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-3xl font-bold text-red-600">
              {statusCounts.PENDING}
            </p>
          </div>

          <div className="h-12 w-12 rounded-lg bg-red-100 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>

        </div>

        {/* Resolved */}
        <div className="bg-white shadow rounded-lg p-4 flex justify-between items-start">

          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-500">Resolved</p>
            <p className="text-3xl font-bold text-green-600">
              {statusCounts.RESOLVED}
            </p>
          </div>

          <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>

        </div>

      </div>

      {filteredReports.length === 0 && (
        <p className="text-gray-500">No assigned reports</p>
      )}

      <div className="bg-white shadow rounded-lg mt-4 overflow-x-auto">

      <table className="min-w-[750px] w-full text-sm text-left">

        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-4 py-3">Ticket ID</th>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Created</th>
            <th className="px-4 py-3">Action</th>
          </tr>
        </thead>

        <tbody>

          {filteredReports.map((r) => (

            <tr
              key={r.id}
              className="border-t hover:bg-gray-50"
            >

              <td className="px-4 py-3 font-medium">
                #{r.ticket_no}
              </td>

              <td className="px-4 py-3">
                <div className="font-semibold">{r.title}</div>
                <div className="text-gray-500 text-xs">
                  {r.description?.slice(0,40)}
                </div>
              </td>

              <td className="px-4 py-3">
                {r.project_name || "-"}
              </td>

              <td className="px-4 py-3">
              <span className={`text-xs ${statusColor(r.status)}`}>
                  {r.status}
                </span>
              </td>

              <td className="px-4 py-3 text-gray-500">
                {new Date(r.created_at).toLocaleDateString()}
              </td>

              <td className="px-4 py-3 flex gap-2 items-center">
  
                {/* LEVEL */}
                <select
                  className="border border-border-light p-1 rounded text-xs"
                  value={levelUpdates[r.id] ?? r.maintenance_level ?? ""}
                  onChange={(e) =>
                    setLevelUpdates({
                      ...levelUpdates,
                      [r.id]: e.target.value
                    })
                  }
                >
                  <option value="">Level</option>
                  <option value="1">L1</option>
                  <option value="2">L2</option>
                  <option value="3">L3</option>
                </select>

                <select
                  className="border border-border-light p-1 rounded text-sm"
                  value={statusUpdates[r.id] || ""}
                  onChange={(e) =>
                    setStatusUpdates({
                      ...statusUpdates,
                      [r.id]: e.target.value
                    })
                  }
                >
                  <option value="">Change</option>
                  <option value="Open">Open</option>
                  <option value="Pending">Pending</option>
                  <option value="Resolved">Resolved</option>
                </select>

                <button
                  onClick={() => updateReport(r.id)}
                  disabled={!statusUpdates[r.id] && !levelUpdates[r.id]}
                  className={`px-2 py-1 rounded text-xs text-white
                    ${!statusUpdates[r.id] && !levelUpdates[r.id]
                      ? "bg-gray-300 cursor-not-allowed"
                      : "bg-green-600 hover:bg-green-700"
                    }`}
                >
                  Update
                </button>

                <button
                  onClick={() => navigate(`/report/${r.id}`)}
                  className="bg-blue-600 text-white text-xs px-3 py-1 rounded"
                >
                  View
                </button>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

    </div>
  );
}
