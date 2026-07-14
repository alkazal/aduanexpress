import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { useNavigate } from "react-router-dom";
import Toast from "../components/Toast";
import { Button } from "../components/ui/button";
import { setSyncStatusListener, setReportSyncedListener, clearSyncListeners } from "../lib/syncEvents";
import { createMySubmissionsEventStream } from "../lib/mySubmissionsEventStream";
//import { startNotificationListener } from "../lib/notificationListener";

import { AlertCircle, CheckCircle, FileText, FolderOpen, Lock } from 'lucide-react';

//import { IconTrendingDown, IconTrendingUp, TrendingUp } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const HomeCharts = lazy(() => import("../components/HomeCharts"));

export default function Home() {
  const [user, setUser] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | done
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");
  const [selectedProject, setSelectedProject] = useState("");
  const [showCharts, setShowCharts] = useState(true);
  const [liveState, setLiveState] = useState("idle");
  const navigate = useNavigate();
  const refreshTimerRef = useRef(null);


  async function wakePushWorker() {
    await fetch("https://yzylysefvtnmyrkidzfk.supabase.co/functions/v1/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });

    console.log("worker booted");
  }

  // Load reports
  const loadReports = async (options = {}) => {
    const { silent = false } = options;

    if (!silent) {
      setLoading(true);
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/login");
      return;
    }

    setUser(session.user);

    const cachedUser = JSON.parse(localStorage.getItem("appUser") || "{}");
    const userRole = cachedUser.role;


    // const { data } = await supabase
    //   .from("user_profiles")
    //   .select("role")
    //   .eq("id", session.user.id)
    //   .single();

    // console.log("MY ROLE →", data.role);

    // Online reports
    let onlineReports = [];
    let list = [];

    if (navigator.onLine) {
      let query;
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
          .eq("user_id", session.user.id)
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
      // const { data, error } = await supabase
      //   .from("reports")
      //   .select("*")
      //   .eq("user_id", session.user.id)
      //   .order("created_at", { ascending: false });

      if (!error) onlineReports = list;


    }

    // Offline reports
    const offlineReports = await db.reports
      .where("user_id")
      .equals(session.user.id)
      .and(r => r.synced === false)
      .toArray();

    setReports([...offlineReports, ...onlineReports]);
    if (!silent) {
      setLoading(false);
    }
  };

  function scheduleSilentRefresh() {
    if (refreshTimerRef.current) return;

    refreshTimerRef.current = window.setTimeout(async () => {
      refreshTimerRef.current = null;
      await loadReports({ silent: true });
    }, 250);
  }

  // Hooks inside component
  useEffect(() => {
    loadReports();

    const rawStatus = localStorage.getItem("postLoginNotificationStatus");
    if (rawStatus) {
      try {
        const parsed = JSON.parse(rawStatus);
        if (parsed?.message) {
          setToastMessage(parsed.message);
          setToastType(parsed.type === "error" ? "error" : "success");
        }
      } catch {
      }
      localStorage.removeItem("postLoginNotificationStatus");
    }

    // Listen to sync status changes
    setSyncStatusListener((status) => {
      setSyncStatus(status);
      if (status === "done") loadReports();
    });

    return () => clearSyncListeners();

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
        stream = await createMySubmissionsEventStream({
          userId,
          onOpen: () => {
            if (mounted) setLiveState("live");
          },
          onError: () => {
            if (mounted) setLiveState(navigator.onLine ? "reconnecting" : "offline");
          },
          onSubmissionUpsert: () => {
            if (!mounted) return;
            scheduleSilentRefresh();
          },
          onSubmissionRemove: () => {
            if (!mounted) return;
            scheduleSilentRefresh();
          },
          onSnapshotRequired: () => {
            if (!mounted) return;
            scheduleSilentRefresh();
          },
        });
      } catch (error) {
        console.error("Unable to start Home SSE stream:", error);
        if (mounted) setLiveState("error");
      }
    }

    initStream();

    const handleOffline = () => setLiveState("offline");
    const handleOnline = () => {
      setLiveState("reconnecting");
      loadReports({ silent: true });
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      mounted = false;
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      stream?.close();
    };
  }, []);

  const projectOptions = Array.from(
    new Set(reports.map((r) => r.project_name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const filteredReports = selectedProject
    ? reports.filter((r) => r.project_name === selectedProject)
    : reports;

  const totalReports = filteredReports.length;
  const pendingSync = filteredReports.filter(r => !r.synced).length;
  const recentReports = filteredReports.slice(0, 5);

  const statusCounts = filteredReports.reduce(
    (acc, r) => {
      const key = (r.status || "").toUpperCase();
      if (key) acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    { NEW: 0, OPEN: 0, PENDING: 0, RESOLVED: 0, CLOSED: 0 }
  );

  // const reportTypes = ["Attendance", "Incident", "Maintenance"];
  const reportTypes = ["Application","Incident", "Maintenance"];
  const chartData = reportTypes.map(type => ({
    type,
    online: filteredReports.filter(r => r.report_type === type && r.synced).length,
    offline: filteredReports.filter(r => r.report_type === type && !r.synced).length,
  }));

  const statusChartData = [
  { name: "NEW", value: statusCounts.NEW },
  { name: "OPEN", value: statusCounts.OPEN },
  { name: "PENDING", value: statusCounts.PENDING },
  { name: "RESOLVED", value: statusCounts.RESOLVED },
  { name: "CLOSED", value: statusCounts.CLOSED }
];

const projectChartData = Object.values(
  filteredReports.reduce((acc, r) => {
    const project = r.project_name || "No Project";

    if (!acc[project]) {
      acc[project] = {
        project,
        count: 0
      };
    }

    acc[project].count += 1;
    return acc;
  }, {})
);

  const liveStateConfig = {
    idle: { label: "Live updates idle", tone: "bg-slate-100 text-slate-700" },
    connecting: { label: "Connecting live updates", tone: "bg-blue-100 text-blue-700" },
    live: { label: "Live updates active", tone: "bg-green-100 text-green-700" },
    reconnecting: { label: "Reconnecting live updates", tone: "bg-amber-100 text-amber-700" },
    offline: { label: "Offline mode", tone: "bg-gray-100 text-gray-700" },
    error: { label: "Live updates unavailable", tone: "bg-red-100 text-red-700" },
  };

  const currentLiveState = liveStateConfig[liveState] || liveStateConfig.idle;
  
  return (
    <div >
      <div className="mb-4">
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${currentLiveState.tone}`}>
          {currentLiveState.label}
        </span>
      </div>
      {syncStatus === "syncing" && (
        <p className="text-blue-600 font-medium mb-4">Syncing offline reports...</p>
      )}
      {/* Mobile: compact single summary card */}
      <div className="sm:hidden mb-4">
        <Card className="border border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Reports Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-5 divide-x text-center pb-4">
            <div className="px-1">
              <p className="text-xl font-bold">{totalReports}</p>
              <p className="text-xs text-muted-foreground leading-tight">Total</p>
            </div>
            <div className="px-1">
              <p className="text-xl font-bold text-blue-600">{statusCounts.OPEN}</p>
              <p className="text-xs text-muted-foreground leading-tight">Open</p>
            </div>
            <div className="px-1">
              <p className="text-xl font-bold text-amber-600">{statusCounts.PENDING}</p>
              <p className="text-xs text-muted-foreground leading-tight">Pending</p>
            </div>
            <div className="px-1">
              <p className="text-xl font-bold text-emerald-600">{statusCounts.RESOLVED}</p>
              <p className="text-xs text-muted-foreground leading-tight">Resolved</p>
            </div>
            <div className="px-1">
              <p className="text-xl font-bold text-gray-600">{statusCounts.CLOSED}</p>
              <p className="text-xs text-muted-foreground leading-tight">Closed</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Desktop: 5 individual KPI cards */}
      <div className="mb-6 hidden sm:grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="border border-border bg-card bg-gradient-to-tr from-gray-100 to-white">
          <CardHeader>
            <CardDescription className="flex w-full items-center justify-between gap-2">
              <span>Total Reports</span>
              <FileText className="size-4 text-slate-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {totalReports}
            </CardTitle>
            
          </CardHeader>
        </Card>
        <Card className="border border-border bg-card bg-gradient-to-tr from-gray-100 to-white">
          <CardHeader>
            <CardDescription className="flex w-full items-center justify-between gap-2">
              <span>Open Reports</span>
              <FolderOpen className="size-4 text-blue-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {statusCounts.OPEN}
            </CardTitle>
            
          </CardHeader>
        
        </Card>
        <Card className="border border-border bg-card bg-gradient-to-tr from-gray-100 to-white">
          <CardHeader>
            <CardDescription className="flex w-full items-center justify-between gap-2">
              <span>Pending Reports</span>
              <AlertCircle className="size-4 text-amber-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {statusCounts.PENDING}
            </CardTitle>
            
          </CardHeader>
          
        </Card>
        <Card className="border border-border bg-card bg-gradient-to-tr from-gray-100 to-white">
          <CardHeader>
            <CardDescription className="flex w-full items-center justify-between gap-2">
              <span>Resolved Reports</span>
              <CheckCircle className="size-4 text-emerald-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {statusCounts.RESOLVED}
            </CardTitle>
            
          </CardHeader>
          
        </Card>
        <Card className="border border-border bg-card bg-gradient-to-tr from-gray-100 to-white">
          <CardHeader>
            <CardDescription className="flex w-full items-center justify-between gap-2">
              <span>Closed Reports</span>
              <Lock className="size-4 text-gray-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {statusCounts.CLOSED}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
      
      {/* Charts — second on mobile (collapsible), first on desktop */}
        <div className="order-2 sm:order-1">
          <button
            className="sm:hidden w-full flex items-center justify-between mb-3 text-sm font-medium text-gray-700 border border-border rounded-lg px-4 py-2 bg-white"
            onClick={() => setShowCharts(p => !p)}
          >
            <span>Charts &amp; Analytics</span>
            <span>{showCharts ? "▲ Hide" : "▼ Show"}</span>
          </button>

          <div className={showCharts ? "block" : "hidden sm:block"}>
            <Suspense
              fallback={
                <div className="mb-6 rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground shadow">
                  Loading charts...
                </div>
              }
            >
              <HomeCharts
                chartData={chartData}
                statusChartData={statusChartData}
                projectChartData={projectChartData}
              />
            </Suspense>
          </div>
        </div>

      {/* Mobile: Recent Reports first, Charts below (collapsible) */}
      {/* Desktop: Charts first, Recent Reports below */}
      <div className="flex flex-col">

        {/* Recent Reports — first on mobile, second on desktop */}
        <div className="order-1 sm:order-2 mb-6">
          <h2 className="text-xl font-semibold mb-3">Recent Reports</h2>
          {loading ? (
            <p>Loading...</p>
          ) : recentReports.length === 0 ? (
            <p className="text-gray-500">No reports yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentReports.map((r) => (
                <div
                  key={r.id}
                  onClick={() => navigate(`/report/${r.id}`)}
                  className="bg-white shadow rounded-lg p-4 cursor-pointer hover:bg-bg-primary"
                >
                  {r.attachment_url && (
                    <img
                      src={r.attachment_url}
                      alt="Attachment"
                      className="w-full h-32 object-cover rounded mb-2"
                    />
                  )}
                  <p className="font-semibold">{r.title}</p>
                  <p className="text-gray-600 text-sm">{r.report_type}</p>
                  {r.project_name && (
                    <p className="text-gray-500 text-sm">Project: {r.project_name}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {new Date(r.created_at).toLocaleString()}
                  </p>
                  {!r.synced && <p className="text-red-500 text-xs mt-1">Offline</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        

      </div>

      <Button
        onClick={() => navigate("/new-report")}
        className="mt-6"
      >
        Submit New Report
      </Button>

      <Toast
        message={toastMessage}
        type={toastType}
        onClose={() => setToastMessage("")}
      />
    </div>
  );
}
