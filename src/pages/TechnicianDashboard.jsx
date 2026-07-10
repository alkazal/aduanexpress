import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { useNavigate } from "react-router-dom";
import { syncReports } from "../lib/sync";
import { toReportServerPayload } from "../lib/reportPayload";
import { createTechnicianEventStream } from "../lib/technicianEventStream";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import StatusBadge from "../components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

import {
  Inbox,
  Mail,
  Clock,
  AlertCircle,
  CheckCircle,
  CalendarRange,
  ChevronDown,
  FileCheck
} from "lucide-react";

function isNetworkLikeError(error) {
  if (!error) return false;

  const message = `${error.message || ""} ${error.details || ""}`.toLowerCase();
  return (
    error.name === "TypeError" ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed")
  );
}

export default function TechnicianDashboard() {
  const [reports, setReports] = useState([]);
  const [projectNameById, setProjectNameById] = useState({});
  const [statusUpdates, setStatusUpdates] = useState({});
  const [loading, setLoading] = useState(true);
  const [liveState, setLiveState] = useState("idle");
  const [selectedProject, setSelectedProject] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [isMobileHeaderCompact, setIsMobileHeaderCompact] = useState(false);
  const [isMobileDateFiltersOpen, setIsMobileDateFiltersOpen] = useState(false);
  const [levelUpdates, setLevelUpdates] = useState({});
  const navigate = useNavigate();
  const PAGE_SIZE = 10;

  function rememberProjectNames(reportList) {
    if (!Array.isArray(reportList) || reportList.length === 0) return;

    setProjectNameById((prev) => {
      let changed = false;
      const next = { ...prev };

      reportList.forEach((report) => {
        if (!report?.project_id || !report?.project_name) return;
        if (next[report.project_id] === report.project_name) return;
        next[report.project_id] = report.project_name;
        changed = true;
      });

      return changed ? next : prev;
    });
  }

  function mergeReportIntoList(prevReports, incomingReport) {
    if (!incomingReport?.id) return prevReports;

    const resolvedProjectName =
      incomingReport.project_name ||
      incomingReport.project?.name ||
      (incomingReport.project_id ? projectNameById[incomingReport.project_id] : null);

    const incoming = {
      ...incomingReport,
      ...(resolvedProjectName ? { project_name: resolvedProjectName } : {}),
    };

    const idx = prevReports.findIndex((r) => r.id === incoming.id);

    if (idx === -1) {
      return [incoming, ...prevReports];
    }

    const next = [...prevReports];
    next[idx] = { ...next[idx], ...incoming };
    return next;
  }

  function removeReportFromList(prevReports, reportId) {
    if (!reportId) return prevReports;
    return prevReports.filter((r) => r.id !== reportId);
  }

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

  useEffect(() => {
    let stream = null;
    let mounted = true;

    async function initStream() {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (!mounted || !userId || !navigator.onLine) {
        setLiveState(navigator.onLine ? "idle" : "offline");
        return;
      }

      setLiveState("connecting");

      try {
        stream = await createTechnicianEventStream({
          userId,
          onOpen: () => {
            if (mounted) setLiveState("live");
          },
          onError: () => {
            if (mounted) setLiveState(navigator.onLine ? "reconnecting" : "offline");
          },
          onReportUpsert: (payload) => {
            if (!mounted) return;

            if (payload.assigned_to && payload.assigned_to !== userId) {
              setReports((prev) => removeReportFromList(prev, payload.id));
              return;
            }

            rememberProjectNames([payload]);

            setReports((prev) => mergeReportIntoList(prev, payload));
          },
          onReportRemove: (payload) => {
            if (!mounted) return;
            setReports((prev) => removeReportFromList(prev, payload.id));
          },
          onSnapshotRequired: async () => {
            if (!mounted) return;
            await loadReports({ silent: true });
          },
        });
      } catch (error) {
        console.error("Unable to start technician SSE stream:", error);
        if (mounted) setLiveState("error");
      }
    }

    initStream();

    const handleOffline = () => setLiveState("offline");
    const handleOnline = () => {
      setLiveState("reconnecting");
      loadReports();
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      mounted = false;
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      stream?.close();
    };
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

  useEffect(() => {
    if (startDate || endDate) {
      setIsMobileDateFiltersOpen(true);
    }
  }, [startDate, endDate]);

  async function loadReports(options = {}) {
    const { silent = false } = options;

    if (!silent) {
      setLoading(true);
    }

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
        // Overlay any locally-saved unsynced changes on top of server data.
        // This ensures a status update the technician made (but hasn't synced yet)
        // stays visible instead of being overwritten by the stale server value.
        const unsyncedLocal = await db.reports
          .filter(r => r.assigned_to === user.id && r.synced === false)
          .toArray();
        const unsyncedMap = new Map(unsyncedLocal.map(r => [r.id, r]));

        const list = (data || []).map((r) => {
          const local = unsyncedMap.get(r.id);
          return {
            ...(local ? { ...r, ...local } : r),
            project_name: r.project?.name || (local || r).project_name || null
          };
        });
        rememberProjectNames(list);
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

      rememberProjectNames(list);
      setReports(list);
    }

    if (!silent) {
      setLoading(false);
    }
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

        if (isNetworkLikeError(error)) {
          alert("Saved offline - will sync when connection is stable");
          // Schedule a background sync retry so it doesn't rely solely on the
          // browser "online" event (which is unreliable on mobile).
          setTimeout(() => syncReports(), 5000);
        } else {
          alert(`Status update failed: ${error.message || "Unknown Supabase error"}`);
        }

        // Reload from local Dexie so the UI reflects the locally-saved change.
        loadReports();
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

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Alert>
          <AlertDescription>Loading...</AlertDescription>
        </Alert>
      </div>
    );
  }

  const projectOptions = Array.from(
    new Set(reports.map((r) => r.project_name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const baseFilteredReports = reports.filter((r) => {
    const matchProject = selectedProject
      ? r.project_name === selectedProject
      : true;

    const createdDate = new Date(r.created_at).toISOString().slice(0, 10);
    const matchStart = startDate ? createdDate >= startDate : true;
    const matchEnd = endDate ? createdDate <= endDate : true;

    const keyword = searchTerm.trim().toLowerCase();
    const matchSearch = keyword
      ? [
          r.ticket_no,
          r.title,
          r.description,
          r.project_name,
          r.status,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(keyword))
      : true;

    return matchProject && matchStart && matchEnd && matchSearch;
  });

  const filteredReports = baseFilteredReports.filter((r) =>
    selectedStatus ? r.status === selectedStatus : true
  );

  const statusCounts = {
    NEW: baseFilteredReports.filter(r => r.status === "New").length,
    OPEN: baseFilteredReports.filter(r => r.status === "Open").length,
    PENDING: baseFilteredReports.filter(r => r.status === "Pending").length,
    RESOLVED: baseFilteredReports.filter(r => r.status === "Resolved").length,
    CLOSED: baseFilteredReports.filter(r => r.status === "Closed").length
  };

  const hasActiveFilters =
    Boolean(selectedProject) ||
    Boolean(selectedStatus) ||
    Boolean(startDate) ||
    Boolean(endDate) ||
    Boolean(searchTerm.trim());

  const hasDateFilters = Boolean(startDate) || Boolean(endDate);

  const totalPages = Math.max(1, Math.ceil(filteredReports.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * PAGE_SIZE;
  const pagedReports = filteredReports.slice(startIndex, startIndex + PAGE_SIZE);

  const liveStateConfig = {
    idle: { label: "Live updates idle", tone: "bg-slate-100 text-slate-700" },
    connecting: { label: "Connecting live updates", tone: "bg-blue-100 text-blue-700" },
    live: { label: "Live updates active", tone: "bg-green-100 text-green-700" },
    reconnecting: { label: "Reconnecting live updates", tone: "bg-amber-100 text-amber-700" },
    offline: { label: "Offline mode", tone: "bg-gray-100 text-gray-700" },
    error: { label: "Live updates unavailable", tone: "bg-red-100 text-red-700" },
  };

  const currentLiveState = liveStateConfig[liveState] || liveStateConfig.idle;

  function clearFilters() {
    setSelectedProject("");
    setSelectedStatus("");
    setStartDate("");
    setEndDate("");
    setSearchTerm("");
    setCurrentPage(1);
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
      const serverUpdates = toReportServerPayload(updates, {
        includeId: false,
        includeUserId: false
      });

      const { error } = await supabase
        .from("reports")
        .update(serverUpdates)
        .eq("id", reportId);

      if (error) {
        console.error(error);
        alert("Saved offline — will sync later");
        return;
      }

      // Insert history if needed
      // if (historyEntry) {
      //   const { error: historyError } = await supabase
      //     .from("report_status_history")
      //     .insert({
      //       report_id: reportId,
      //       old_status: historyEntry.old_status,
      //       new_status: historyEntry.new_status,
      //       changed_by: historyEntry.changed_by,
      //       changed_by_name: historyEntry.changed_by_name,
      //       changed_at: historyEntry.changed_at
      //     });

      //   if (historyError) {
      //     console.error("History insert failed:", historyError);
      //   }
      // }

      await db.reports.update(reportId, {
        synced: true,
        ...(historyEntry ? { _status_changes: [] } : {})
      });
    }

    alert("✅ Updated successfully");
    loadReports();
  }

  return (
    <div>
      <div
        className={`sticky top-16 z-20 mx-0 px-0 mb-4 bg-gray-50/95 backdrop-blur border-b border-gray-100 transition-all duration-200 ${
          isMobileHeaderCompact ? "pt-2 pb-2 shadow-sm" : "pt-4 pb-3"
        } sm:static sm:pt-0 sm:pb-0 sm:bg-transparent sm:backdrop-blur-0 sm:border-b-0 sm:shadow-none`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="w-full sm:w-auto">
            <h1 className="text-xl font-bold">Technician Dashboard</h1>
            <div className="mt-1">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${currentLiveState.tone}`}
              >
                {currentLiveState.label}
              </span>
            </div>
            {/* <p className="text-gray-500 text-sm">
              Update your personal information 
            </p> */}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 w-full sm:max-w-4xl">
            <div className="w-full sm:flex-1">
              <Label className="text-xs font-semibold text-gray-700 mb-1">
                Project
              </Label>
              <Select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
              >
              <option value="">All Projects</option>
              {projectOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </Select>
          </div>  

            <div className="hidden sm:block w-full sm:flex-1">
              <Input
                type="text"
                placeholder="Search ticket, title, project, status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Button
              type="button"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              variant="outline"
              className="hidden sm:flex h-10"
            >
              Clear Filters
            </Button>

            <div className="hidden sm:block w-full sm:flex-1">
            <Label className="text-xs font-semibold text-gray-700 mb-1">
              Start Date
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Start date"
            />
            </div>

            <div className="hidden sm:block w-full sm:flex-1">
            <Label className="text-xs font-semibold text-gray-700 mb-1">
              End Date
            </Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="End date"
            />
            </div>
          </div>
        </div>

        <div className="mt-3 sm:hidden">
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsMobileDateFiltersOpen((open) => !open)}
            className="w-full h-10 justify-between"
          >
            <span className="flex items-center gap-2 text-sm">
              <CalendarRange className="h-4 w-4" />
              {hasActiveFilters ? "Filters applied" : "Search & Filter"}
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                isMobileDateFiltersOpen ? "rotate-180" : ""
              }`}
            />
          </Button>

          {isMobileDateFiltersOpen && (
            <div className="mt-2 grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
              <div className="w-full">
                <Label className="text-xs font-semibold text-gray-700 mb-1">
                  Search
                </Label>
                <Input
                  type="text"
                  placeholder="Search ticket, title, project, status..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="w-full">
                <Label className="text-xs font-semibold text-gray-700 mb-1">
                  Start Date
                </Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  aria-label="Start date"
                />
              </div>

              <div className="w-full">
                <Label className="text-xs font-semibold text-gray-700 mb-1">
                  End Date
                </Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  aria-label="End date"
                />
              </div>

              <Button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                variant="outline"
                className="w-full h-10"
              >
                Clear Filters
              </Button>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 sm:hidden">
          <Button
            type="button"
            onClick={() => setSelectedStatus("")}
            variant="outline"
            className={`h-auto px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${
              selectedStatus === ""
                ? "bg-gray-600 text-white border-gray-600 hover:bg-gray-600"
                : ""
            }`}
          >
            All ({baseFilteredReports.length})
          </Button>
          <Button
            type="button"
            onClick={() => setSelectedStatus("New")}
            variant="outline"
            className={`h-auto px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${
              selectedStatus === "New"
                ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-600"
                : ""
            }`}
          >
            New ({statusCounts.NEW})
          </Button>
          <Button
            type="button"
            onClick={() => setSelectedStatus("Open")}
            variant="outline"
            className={`h-auto px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${
              selectedStatus === "Open"
                ? "bg-yellow-500 text-white border-yellow-500 hover:bg-yellow-500"
                : ""
            }`}
          >
            Open ({statusCounts.OPEN})
          </Button>
          <Button
            type="button"
            onClick={() => setSelectedStatus("Pending")}
            variant="outline"
            className={`h-auto px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${
              selectedStatus === "Pending"
                ? "bg-orange-500 text-white border-orange-500 hover:bg-orange-500"
                : ""
            }`}
          >
            Pending ({statusCounts.PENDING})
          </Button>
          <Button
            type="button"
            onClick={() => setSelectedStatus("Resolved")}
            variant="outline"
            className={`h-auto px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${
              selectedStatus === "Resolved"
                ? "bg-green-600 text-white border-green-600 hover:bg-green-600"
                : ""
            }`}
          >
            Resolved ({statusCounts.RESOLVED})
          </Button>
          <Button
            type="button"
            onClick={() => setSelectedStatus("Closed")}
            variant="outline"
            className={`h-auto px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${
              selectedStatus === "Closed"
                ? "bg-gray-600 text-white border-gray-600 hover:bg-gray-600"
                : ""
            }`}
          >
            Closed ({statusCounts.CLOSED})
          </Button>
        </div>
      </div>

      <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <Card
          onClick={() => setSelectedStatus("")}
          className={`cursor-pointer hover:bg-gray-50 ${
            selectedStatus === "" ? "ring-2 ring-gray-500" : ""
          }`}
        >
          <CardContent className="p-4 flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">Assigned Tickets</p>
              <p className="text-3xl font-bold text-gray-700">{baseFilteredReports.length}</p>
            </div>

            <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <Inbox className="h-6 w-6 text-gray-600" />
            </div>
          </CardContent>
        </Card>
        <Card
          onClick={() => setSelectedStatus("New")}
          className={`cursor-pointer hover:bg-gray-50 ${
            selectedStatus === "New" ? "ring-2 ring-blue-500" : ""
          }`}
        >
          <CardContent className="p-4 flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">New</p>
              <p className="text-3xl font-bold text-gray-700">{statusCounts.NEW}</p>
            </div>

            <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
              <Mail className="h-6 w-6 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card
          onClick={() => setSelectedStatus("Open")}
          className={`cursor-pointer hover:bg-gray-50 ${
            selectedStatus === "Open" ? "ring-2 ring-yellow-500" : ""
          }`}
        >
          <CardContent className="p-4 flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">Open</p>
              <p className="text-3xl font-bold text-gray-700">{statusCounts.OPEN}</p>
            </div>

            <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
              <Clock className="h-6 w-6 text-purple-600" />
            </div>
          </CardContent>
        </Card>
        <Card
          onClick={() => setSelectedStatus("Pending")}
          className={`cursor-pointer hover:bg-gray-50 ${
            selectedStatus === "Pending" ? "ring-2 ring-orange-500" : ""
          }`}
        >
          <CardContent className="p-4 flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-3xl font-bold text-red-600">{statusCounts.PENDING}</p>
            </div>

            <div className="h-12 w-12 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
          </CardContent>
        </Card>
        <Card
          onClick={() => setSelectedStatus("Resolved")}
          className={`cursor-pointer hover:bg-gray-50 ${
            selectedStatus === "Resolved" ? "ring-2 ring-green-500" : ""
          }`}
        >
          <CardContent className="p-4 flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">Resolved</p>
              <p className="text-3xl font-bold text-green-600">{statusCounts.RESOLVED}</p>
            </div>

            <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card
          onClick={() => setSelectedStatus("Closed")}
          className={`cursor-pointer hover:bg-gray-50 ${
            selectedStatus === "Closed" ? "ring-2 ring-gray-500" : ""
          }`}
        >
          <CardContent className="p-4 flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">Closed</p>
              <p className="text-3xl font-bold text-gray-700">{baseFilteredReports.length}</p>
            </div>

            <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center">
              <FileCheck className="h-6 w-6 text-gray-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {filteredReports.length === 0 && (
        <Alert>
          <AlertDescription>No assigned reports</AlertDescription>
        </Alert>
      )}

      {filteredReports.length > 0 && (
        <div className="mt-3 space-y-2.5 sm:hidden px-2">
          {pagedReports.map((r) => (
            <Card key={r.id} className="border-gray-100 w-full">
              <CardContent className="p-2.5">
                <div className="min-w-0 w-full overflow-hidden">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[11px] leading-tight text-gray-500 truncate">Ticket #{r.ticket_no}</p>
                    <StatusBadge status={r.status} className="inline-flex flex-shrink-0 text-[11px]" />
                  </div>
                  <h3 className="mt-1 text-sm leading-snug font-semibold text-gray-900 break-words line-clamp-2">{r.title}</h3>
                </div>

                <div className="mt-1.5 text-[11px] text-gray-600 space-y-0.5">
                  <p className="truncate">Project: {r.project_name || "-"}</p>
                  <p>Created: {new Date(r.created_at).toLocaleDateString()}</p>
                </div>

                <p className="mt-1.5 text-[11px] leading-snug text-gray-500 line-clamp-2">
                  {r.description || "No description"}
                </p>

                <div className="mt-2.5 grid grid-cols-2 gap-1.5 w-full">
                  <Select
                    className="h-8 text-xs w-full"
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
                  </Select>

                  <Select
                    className="h-8 text-[12px] w-full"
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
                  </Select>
                </div>

                <div className="mt-2.5 flex flex-col gap-1.5">
                  <Button
                    onClick={() => updateReport(r.id)}
                    disabled={!statusUpdates[r.id] && !levelUpdates[r.id]}
                    className="w-full h-8 bg-green-600 hover:bg-green-700 text-xs"
                  >
                    Update
                  </Button>

                  <Button
                    onClick={() => navigate(`/report/${r.id}`)}
                    className="w-full h-8 text-xs"
                  >
                    View
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-4 overflow-x-auto hidden sm:block">
        <div className="w-full overflow-x-auto">

        <Table className="min-w-[900px] text-left">

          <TableHeader className="bg-gray-50 text-gray-600">
            <TableRow>
              <TableHead className="px-4 py-3 whitespace-nowrap">Ticket ID</TableHead>
              <TableHead className="px-4 py-3 whitespace-nowrap">Subject</TableHead>
              <TableHead className="px-4 py-3 whitespace-nowrap">Project</TableHead>
              <TableHead className="px-4 py-3 whitespace-nowrap">Status</TableHead>
              <TableHead className="px-4 py-3 whitespace-nowrap">Created</TableHead>
              <TableHead className="px-4 py-3 whitespace-nowrap">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>

            {pagedReports.map((r) => (

              <TableRow
                key={r.id}
                className="border-t hover:bg-gray-50"
              >

                <TableCell className="px-4 py-3 whitespace-nowrap font-medium">
                  #{r.ticket_no}
                </TableCell>

                <TableCell className="px-4 py-3 whitespace-nowrap">
                  <div className="font-semibold">{r.title}</div>
                  <div className="text-gray-500 text-xs">
                    {r.description?.slice(0,40)}
                  </div>
                </TableCell>

                <TableCell className="px-4 py-3 whitespace-nowrap">
                  {r.project_name || "-"}
                </TableCell>

                <TableCell className="px-4 py-3 whitespace-nowrap">
                  <StatusBadge status={r.status} className="text-xs" />
                </TableCell>

                <TableCell className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {new Date(r.created_at).toLocaleDateString()}
                </TableCell>

                <TableCell className="px-4 py-3 flex whitespace-nowrap gap-2 items-center">
    
                  <Select
                    className="h-8 text-xs"
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
                  </Select>

                  <Select
                    className="h-8 text-sm"
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
                  </Select>

                  <Button
                    onClick={() => updateReport(r.id)}
                    disabled={!statusUpdates[r.id] && !levelUpdates[r.id]}
                    className="h-8 px-2 py-1 text-xs bg-green-600 hover:bg-green-700"
                  >
                    Update
                  </Button>

                  <Button
                    onClick={() => navigate(`/report/${r.id}`)}
                    className="h-8 text-xs px-3 py-1"
                  >
                    View
                  </Button>

                </TableCell>

              </TableRow>

            ))}

          </TableBody>

        </Table>

        </div>

      </Card>

    {filteredReports.length > 0 && (
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500">
          Page {safePage} of {totalPages}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
          >
            Next
          </Button>
        </div>
      </div>
    )}

    </div>
  );
}
