import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { useNavigate } from "react-router-dom";
//import { syncReports, setSyncStatusListener, setReportSyncedListener } from "../lib/sync";
import { setSyncStatusListener, setReportSyncedListener } from "../lib/syncEvents";

function statusBadge(status) {
  if (status === "Open")
    return "bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs font-semibold";
  if (status === "Pending")
    return "bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-semibold";
  if (status === "Resolved")
    return "bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold";
  return "bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs";
}

export default function MySubmissions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("idle");
  const [selectedProject, setSelectedProject] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const navigate = useNavigate();
  

  const loadData = async () => {
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;

    const cachedUser = JSON.parse(localStorage.getItem("appUser") || "{}");
    const userRole = cachedUser.role;

    if (!userId) {
      if (navigator.onLine) navigate("/login");
      const offlineData = await db.reports.toArray();
      setItems(offlineData);
      setLoading(false);
      return;
    }

    let onlineData = [];
    let list = [];

    if (navigator.onLine) {
      let query;

      // ⭐ ROLE-BASED FILTER
      if (userRole === "manager") {
        query = supabase
          .from("reports")
          .select(`
            *,
            user_profiles: user_id ( full_name ),
            technician:assigned_to ( full_name ),
            project:project_id ( name )
          `)
          .order("created_at", { ascending: false });
      } else {
        query = supabase
          .from("reports")
          .select(`
            *,
            user_profiles: user_id ( full_name ),
            technician:assigned_to ( full_name ),
            project:project_id ( name )
          `)
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
      }

      const { data, error } = await query;

      if (!error) {
        list = data.map(r => ({
          ...r,
          submitted_by: r.user_profiles?.full_name || "Unknown",
          assigned_to: r.technician?.full_name || "Unknown",
          project_name: r.project?.name || r.project_name || null
        }));
      }
    } else {

      // ⭐ OFFLINE FILTER (role-based)
      let offlineData = [];

      if (userRole === "manager") {
        offlineData = await db.reports.toArray();
      } else {
        offlineData = await db.reports
          .where("user_id")
          .equals(userId)
          .toArray();
      }

      list = offlineData.map(r => ({
        ...r,
        submitted_by: userRole === "manager"
          ? r.reporter_name || "User"
          : r.reporter_name || "You",
        assigned_to: r.technician_name,
        project_name: r.project_name || null
      }));
    }

    //setItems([...offlineData, ...onlineData]);    
    setItems(list);
    setLoading(false);
  };


  useEffect(() => {
    loadData();

    setSyncStatusListener((status) => {
      setSyncStatus(status);
      if (status === "done") loadData();
    });

  }, []);

  const projectOptions = Array.from(
    new Set(items.map((r) => r.project_name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const filteredItems = items.filter((r) => {
    const matchProject = selectedProject
      ? r.project_name === selectedProject
      : true;

    const matchStatus = selectedStatus
      ? r.status === selectedStatus
      : true;

    const createdDate = new Date(r.created_at).toISOString().slice(0, 10);
    const matchStart = startDate ? createdDate >= startDate : true;
    const matchEnd = endDate ? createdDate <= endDate : true;

    return matchProject && matchStatus && matchStart && matchEnd;
  });

  const totalReports = filteredItems.length; // total changes when status clicked

  const openReports = items.filter((r) => r.status === "Open").length;
  const pendingReports = items.filter((r) => r.status === "Pending").length;
  const resolvedReports = items.filter((r) => r.status === "Resolved").length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="flex items-end gap-3 w-full max-w-2xl">
          <div className="flex-1">
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

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              className="border border-border-light rounded-md p-2 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Start date"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-700 mb-1">End Date</label>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {/* Total */}
      <div
        onClick={() => setSelectedStatus("")}
        className={`bg-white shadow rounded-lg p-4 cursor-pointer hover:bg-gray-50 ${
          selectedStatus === "" ? "ring-2 ring-blue-500" : ""
        }`}
      >
        <p className="text-gray-500 text-sm">Total Reports</p>
        <p className="text-2xl font-bold">{totalReports}</p>
      </div>
      {/* Open */}
      <div
        onClick={() => setSelectedStatus("Open")}
        className={`bg-white shadow rounded-lg p-4 cursor-pointer hover:bg-gray-50 ${
          selectedStatus === "Open" ? "ring-2 ring-yellow-500" : ""
        }`}
      >
        <p className="text-gray-500 text-sm">Open</p>
        <p className="text-2xl font-bold text-yellow-600">{openReports}</p>
      </div>
      {/* Pending */}
      <div
        onClick={() => setSelectedStatus("Pending")}
        className={`bg-white shadow rounded-lg p-4 cursor-pointer hover:bg-gray-50 ${
          selectedStatus === "Pending" ? "ring-2 ring-orange-500" : ""
        }`}
      >
        <p className="text-gray-500 text-sm">Pending</p>
        <p className="text-2xl font-bold text-orange-600">{pendingReports}</p>
      </div>
      {/* Resolved */}
      <div
        onClick={() => setSelectedStatus("Resolved")}
        className={`bg-white shadow rounded-lg p-4 cursor-pointer hover:bg-gray-50 ${
          selectedStatus === "Resolved" ? "ring-2 ring-green-500" : ""
        }`}
      >
        <p className="text-gray-500 text-sm">Resolved</p>
        <p className="text-2xl font-bold text-green-600">{resolvedReports}</p>
      </div>
    </div>

      {syncStatus === "syncing" && (
        <p className="text-blue-600 font-medium mb-2">Syncing offline reports...</p>
      )}

      {loading && <p>Loading...</p>}

      {!loading && filteredItems.length === 0 && (
        <p className="text-gray-500">You have no report submissions yet.</p>
      )}

      <div className="bg-white shadow rounded-lg overflow-hidden mt-4">

        <table className="w-full text-sm text-left">

          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3">Ticket ID</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned To</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>

          <tbody>

            {filteredItems.map((x) => (
              <tr
                key={x.id}
                onClick={() => navigate(`/report/${x.id}`)}
                className="border-t hover:bg-gray-50 cursor-pointer"
              >

                <td className="px-4 py-3 font-medium">
                  #{x.ticket_no}
                </td>

                <td className="px-4 py-3">
                  <div className="font-semibold">{x.title}</div>
                  <div className="text-gray-500 text-xs">
                    {x.submitted_by}
                  </div>
                </td>

                <td className="px-4 py-3">
                  {x.project_name || "-"}
                </td>

                <td className="px-4 py-3">
                  <span className={statusBadge(x.status)}>
                    {x.status}
                  </span>
                </td>

                <td className="px-4 py-3">
                  {x.assigned_to}
                </td>

                <td className="px-4 py-3 text-gray-500">
                  {new Date(x.created_at).toLocaleDateString()}
                </td>

              </tr>
            ))}

          </tbody>

        </table>

      </div>
    </div>
  );
}
