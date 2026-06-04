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
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobileHeaderCompact, setIsMobileHeaderCompact] = useState(false);
  const navigate = useNavigate();
  const PAGE_SIZE = 10;
  

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
          project_name: r.project?.name || r.project_name || r.project_id || null,
          project_key: r.project_id || r.project?.name || r.project_name || "NO_PROJECT"
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
        project_name: r.project_name || r.project_id || null,
        project_key: r.project_id || r.project_name || "NO_PROJECT"
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

  useEffect(() => {
    const onScroll = () => {
      setIsMobileHeaderCompact(window.scrollY > 24);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedProject, startDate, endDate, selectedStatus, searchTerm]);

  const projectOptions = Array.from(
    new Map(
      items
        .filter((r) => r.project_key)
        .map((r) => [r.project_key, r.project_name || "Unknown Project"])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const baseFilteredItems = items.filter((r) => {
    const matchProject = selectedProject
      ? (r.project_key || "") === selectedProject
      : true;

    const createdDate = new Date(r.created_at).toISOString().slice(0, 10);
    const matchStart = startDate ? createdDate >= startDate : true;
    const matchEnd = endDate ? createdDate <= endDate : true;

    const keyword = searchTerm.trim().toLowerCase();
    const matchSearch = keyword
      ? [
          r.ticket_no,
          r.title,
          r.submitted_by,
          r.assigned_to,
          r.project_name,
          r.status
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(keyword))
      : true;

    return matchProject && matchStart && matchEnd && matchSearch;
  });

  const filteredItems = baseFilteredItems.filter((r) =>
    selectedStatus ? r.status === selectedStatus : true
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pagedItems = filteredItems.slice(startIndex, startIndex + PAGE_SIZE);
  const hasActiveFilters =
    Boolean(selectedProject) ||
    Boolean(selectedStatus) ||
    Boolean(startDate) ||
    Boolean(endDate) ||
    Boolean(searchTerm.trim());

  function clearFilters() {
    setSelectedProject("");
    setSelectedStatus("");
    setStartDate("");
    setEndDate("");
    setSearchTerm("");
    setCurrentPage(1);
  }

  const totalReports = filteredItems.length;

  const openReports = baseFilteredItems.filter((r) => r.status === "Open").length;
  const pendingReports = baseFilteredItems.filter((r) => r.status === "Pending").length;
  const resolvedReports = baseFilteredItems.filter((r) => r.status === "Resolved").length;

  return (
    <div className="p-6">
      <div
        className={`sticky top-0 z-20 -mx-6 px-6 mb-4 bg-gray-50/95 backdrop-blur border-b border-gray-100 transition-all duration-200 ${
          isMobileHeaderCompact ? "pt-2 pb-2 shadow-sm" : "pt-4 pb-3"
        } sm:static sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:bg-transparent sm:backdrop-blur-0 sm:border-b-0 sm:shadow-none`}
      >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 w-full max-w-2xl">

          <div className="w-full sm:flex-1">
            <select
              className="w-full border border-border-light rounded-md p-2 text-sm"
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
            >
              <option value="">All Projects</option>
              {projectOptions.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="w-full sm:flex-1">
            <input
              type="text"
              className="w-full border border-border-light rounded-md p-2 text-sm"
              placeholder="Search ticket, title, project, status..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
            className="h-10 px-3 rounded-md border border-border-light text-sm text-gray-700 bg-white disabled:opacity-50"
          >
            Clear Filters
          </button>

          <div className="w-full sm:w-auto flex flex-col">
            <label className="text-xs font-semibold text-gray-700 mb-1">Start Date</label>
            <input
              type="date"
              className="border border-border-light rounded-md p-2 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Start date"
            />
          </div>

          <div className="w-full sm:w-auto flex flex-col">
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

      <div className="mt-3 flex items-center gap-2 overflow-x-auto sm:hidden">
        <button
          type="button"
          onClick={() => setSelectedStatus("")}
          className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
            selectedStatus === ""
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-700 border-gray-200"
          }`}
        >
          All ({baseFilteredItems.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStatus("Open")}
          className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
            selectedStatus === "Open"
              ? "bg-yellow-500 text-white border-yellow-500"
              : "bg-white text-gray-700 border-gray-200"
          }`}
        >
          Open ({openReports})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStatus("Pending")}
          className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
            selectedStatus === "Pending"
              ? "bg-orange-500 text-white border-orange-500"
              : "bg-white text-gray-700 border-gray-200"
          }`}
        >
          Pending ({pendingReports})
        </button>
        <button
          type="button"
          onClick={() => setSelectedStatus("Resolved")}
          className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
            selectedStatus === "Resolved"
              ? "bg-green-600 text-white border-green-600"
              : "bg-white text-gray-700 border-gray-200"
          }`}
        >
          Resolved ({resolvedReports})
        </button>
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

      {!loading && pagedItems.length > 0 && (
        <div className="mt-4 space-y-3 sm:hidden">
          {pagedItems.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => navigate(`/report/${x.id}`)}
              className="w-full text-left bg-white shadow rounded-xl p-4 border border-gray-100"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Ticket #{x.ticket_no}</p>
                  <h3 className="font-semibold text-gray-900 truncate">{x.title}</h3>
                </div>
                <span className={statusBadge(x.status)}>{x.status}</span>
              </div>

              <div className="mt-2 text-xs text-gray-600 space-y-1">
                <p>Submitted by: {x.submitted_by || "-"}</p>
                <p>Project: {x.project_name || "-"}</p>
                <p>Assigned to: {x.assigned_to || "-"}</p>
                <p>Created: {new Date(x.created_at).toLocaleDateString()}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white shadow rounded-lg mt-4 overflow-x-auto hidden sm:block">

        <table className="min-w-[700px] w-full text-sm text-left">

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

            {pagedItems.map((x) => (
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

      {!loading && filteredItems.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-gray-500">
            Showing {startIndex + 1}-{Math.min(startIndex + PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Prev
            </button>
            <span className="text-gray-600">Page {safePage} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
