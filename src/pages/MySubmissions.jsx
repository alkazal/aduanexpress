import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { useNavigate } from "react-router-dom";
//import { syncReports, setSyncStatusListener, setReportSyncedListener } from "../lib/sync";
import { setSyncStatusListener, setReportSyncedListener } from "../lib/syncEvents";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import StatusBadge from "../components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Inbox, Clock, AlertCircle, CheckCircle, CalendarRange, ChevronDown } from "lucide-react";

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
  const [isMobileDateFiltersOpen, setIsMobileDateFiltersOpen] = useState(false);
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

  useEffect(() => {
    if (startDate || endDate) {
      setIsMobileDateFiltersOpen(true);
    }
  }, [startDate, endDate]);

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
    <div>
      <div
        className={`sticky top-16 z-20 mx-0 px-0 mb-4 bg-gray-50/95 backdrop-blur border-b border-gray-100 transition-all duration-200 ${
          isMobileHeaderCompact ? "pt-2 pb-2 shadow-sm" : "pt-4 pb-3"
        } sm:static sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:bg-transparent sm:backdrop-blur-0 sm:border-b-0 sm:shadow-none`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Reports</h1>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 w-full sm:max-w-4xl">

            <div className="w-full sm:flex-1">
              <Label className="text-xs font-semibold text-gray-700 mb-1">Project</Label>
              <Select
                className="w-full"
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
              >
                <option value="">All Projects</option>
                {projectOptions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
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

            <div className="hidden sm:block w-full sm:w-auto">
              <Label className="text-xs font-semibold text-gray-700 mb-1">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="Start date"
              />
            </div>

            <div className="hidden sm:block w-full sm:w-auto">
              <Label className="text-xs font-semibold text-gray-700 mb-1">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="End date"
              />
            </div>
          </div>
        </div>

        {/* Mobile collapsible Search & Filter panel */}
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
                <Label className="text-xs font-semibold text-gray-700 mb-1">Search</Label>
                <Input
                  type="text"
                  placeholder="Search ticket, title, project, status..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="w-full">
                <Label className="text-xs font-semibold text-gray-700 mb-1">Start Date</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  aria-label="Start date"
                />
              </div>
              <div className="w-full">
                <Label className="text-xs font-semibold text-gray-700 mb-1">End Date</Label>
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

        <div className="mt-3 flex items-center gap-2 overflow-x-auto sm:hidden">
          <Button
            type="button"
            onClick={() => setSelectedStatus("")}
            variant="outline"
            className={`h-auto px-3 py-1.5 rounded-full text-xs whitespace-nowrap ${
              selectedStatus === ""
                ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-600"
                : ""
            }`}
          >
            All ({baseFilteredItems.length})
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
            Open ({openReports})
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
            Pending ({pendingReports})
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
            Resolved ({resolvedReports})
          </Button>
        </div>
      </div>

      <div className="hidden sm:grid sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card
          onClick={() => setSelectedStatus("")}
          className={`cursor-pointer hover:bg-gray-50 ${
            selectedStatus === "" ? "ring-2 ring-blue-500" : ""
          }`}
        >
          <CardContent className="p-4 flex justify-between items-start">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">Total Reports</p>
              <p className="text-3xl font-bold text-gray-700">{totalReports}</p>
            </div>
            <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
              <Inbox className="h-6 w-6 text-blue-600" />
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
              <p className="text-3xl font-bold text-gray-700">{openReports}</p>
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
              <p className="text-3xl font-bold text-red-600">{pendingReports}</p>
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
              <p className="text-3xl font-bold text-green-600">{resolvedReports}</p>
            </div>
            <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {syncStatus === "syncing" && (
        <Alert className="mb-2 border-blue-200 bg-blue-50 text-blue-700">
          <AlertDescription>Syncing offline reports...</AlertDescription>
        </Alert>
      )}

      {loading && (
        <Alert>
          <AlertDescription>Loading...</AlertDescription>
        </Alert>
      )}

      {!loading && filteredItems.length === 0 && (
        <Alert>
          <AlertDescription>You have no report submissions yet.</AlertDescription>
        </Alert>
      )}

      {!loading && pagedItems.length > 0 && (
        <div className="mt-4 space-y-3 sm:hidden">
          {pagedItems.map((x) => (
            <Card
              key={x.id}
              onClick={() => navigate(`/report/${x.id}`)}
              className="cursor-pointer border border-gray-100 w-full overflow-hidden"
            >
              <CardContent className="p-3">
                <div className="min-w-0 w-full overflow-hidden">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] text-gray-500 truncate">Ticket #{x.ticket_no}</p>
                    <StatusBadge status={x.status} className="flex-shrink-0" />
                  </div>
                  <h3 className="mt-1 text-sm font-semibold text-gray-900 break-words line-clamp-2">{x.title}</h3>
                </div>

                <div className="mt-2 text-[11px] text-gray-600 space-y-0.5">
                  <p className="truncate">Submitted by: {x.submitted_by || "-"}</p>
                  <p className="truncate">Project: {x.project_name || "-"}</p>
                  <p className="truncate">Assigned to: {x.assigned_to || "-"}</p>
                  <p>Created: {new Date(x.created_at).toLocaleDateString()}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="bg-white shadow rounded-lg mt-4 overflow-x-auto hidden sm:block">

        <Table className="min-w-[700px] text-left">

          <TableHeader className="bg-gray-50 text-gray-600">
            <TableRow>
              <TableHead className="px-4 py-3">Ticket ID</TableHead>
              <TableHead className="px-4 py-3">Subject</TableHead>
              <TableHead className="px-4 py-3">Project</TableHead>
              <TableHead className="px-4 py-3">Status</TableHead>
              <TableHead className="px-4 py-3">Assigned To</TableHead>
              <TableHead className="px-4 py-3">Created</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>

            {pagedItems.map((x) => (
              <TableRow
                key={x.id}
                onClick={() => navigate(`/report/${x.id}`)}
                className="border-t hover:bg-gray-50 cursor-pointer"
              >

                <TableCell className="px-4 py-3 font-medium">
                  #{x.ticket_no}
                </TableCell>

                <TableCell className="px-4 py-3">
                  <div className="font-semibold">{x.title}</div>
                  <div className="text-gray-500 text-xs">
                    {x.submitted_by}
                  </div>
                </TableCell>

                <TableCell className="px-4 py-3">
                  {x.project_name || "-"}
                </TableCell>

                <TableCell className="px-4 py-3">
                  <StatusBadge status={x.status} />
                </TableCell>

                <TableCell className="px-4 py-3">
                  {x.assigned_to}
                </TableCell>

                <TableCell className="px-4 py-3 text-gray-500">
                  {new Date(x.created_at).toLocaleDateString()}
                </TableCell>

              </TableRow>
            ))}

          </TableBody>

        </Table>

      </div>

      {!loading && filteredItems.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <p className="text-gray-500">
            Showing {startIndex + 1}-{Math.min(startIndex + PAGE_SIZE, filteredItems.length)} of {filteredItems.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              variant="outline"
              size="sm"
            >
              Prev
            </Button>
            <span className="text-gray-600">Page {safePage} / {totalPages}</span>
            <Button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              variant="outline"
              size="sm"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
