import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { useNavigate } from "react-router-dom";
import Toast from "../components/Toast";
import { setSyncStatusListener, setReportSyncedListener, clearSyncListeners } from "../lib/syncEvents";
//import { startNotificationListener } from "../lib/notificationListener";

import { 
  Inbox, 
  Clock, 
  AlertCircle, 
  CheckCircle, 
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Star
} from 'lucide-react';

import {  
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell
} from "recharts";

export default function Home() {
  const [user, setUser] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | done
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");
  const [selectedProject, setSelectedProject] = useState("");
  const navigate = useNavigate();


  async function wakePushWorker() {
    await fetch("https://yzylysefvtnmyrkidzfk.supabase.co/functions/v1/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });

    console.log("worker booted");
  }

  // Load reports
  const loadReports = async () => {
    setLoading(true);

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
    setLoading(false);
  };

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

  const reportTypes = ["Attendance", "Incident", "Maintenance"];
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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Welcome, {user?.email ?? "User"}!
      </h1>

      
      {/* <div className="p-4 border rounded">
        <button onClick={wakePushWorker} className="bg-gray-600 hover:bg-gray-700 text-white py-1 px-3 rounded mt-2">
          Wake Up Worker
        </button>
      </div> */}


      {syncStatus === "syncing" && (
        <p className="text-blue-600 font-medium mb-4">Syncing offline reports...</p>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">

        {/* Total Reports */}
        <div className="bg-white shadow rounded-lg p-4 flex justify-between items-start">
          
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-500">Total Reports</p>
            <p className="text-4xl font-bold text-gray-700">{totalReports}</p>
            <div className="flex items-center gap-1 text-xs text-green-600">
              <TrendingUp className="h-3 w-3" />
              <span>+{statusCounts.NEW} New</span>
            </div>
          </div>

          {/* Icon */}
          <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
            <Inbox className="h-6 w-6 text-blue-600" />
          </div>
        </div>

        {/* Open + Pending Sync Card */}
        <div className="bg-white shadow rounded-lg p-4 flex justify-between items-start">
          
          <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-500">Open</p>
              <p className="text-3xl font-bold text-gray-700">{statusCounts.OPEN}</p>
              <p className="flex items-center gap-1 text-xs text-gray-500">
                <TrendingDown className="h-3 w-3" />
                <span>{pendingSync > 0 ? `${pendingSync} Needs Sync` : "All Synced"}</span>
              </p>
          </div>

          {/* Icon */}
          <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center">
            <Clock className="h-6 w-6 text-purple-600" />
          </div>
        </div>

        {/* Pending */}
        <div className="bg-white shadow rounded-lg p-4 flex justify-between items-start">
          
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-3xl font-bold text-red-600">{statusCounts.PENDING}</p>
            <p className="text-xs text-red-500">Needs Attention</p>
          </div>

          {/* Icon */}
          <div className="h-12 w-12 rounded-lg bg-red-100 flex items-center justify-center">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
        </div>

        {/* Resolved */}
        <div className="bg-white shadow rounded-lg p-4 flex justify-between items-start">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-500">Resolved</p>
            <p className="text-3xl font-bold text-green-600">{statusCounts.RESOLVED}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>

          {/* Icon */}
          <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
        </div>

        {/* Closed */}
        <div className="bg-white shadow rounded-lg p-4 flex justify-between items-start">
          
          <div className="flex flex-col gap-2">
            <p className="text-sm text-gray-500">Closed</p>
            <p className="text-3xl font-bold text-gray-700">{statusCounts.CLOSED}</p>
            <p className="text-xs text-gray-500">No follow-up</p>
          </div>

          {/* Icon */}
          <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-gray-700" />
          </div>
        </div>

      </div>

      {/* Stacked Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

      {/* Reports by Type */}
      <div className="bg-white shadow rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">
          Reports by Type (Online vs Offline)
        </h2>

        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <XAxis dataKey="type" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="online" stackId="a" fill="#3b82f6" />
            <Bar dataKey="offline" stackId="a" fill="#f87171" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Status Chart */}
      <div className="bg-white shadow rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-4">Reports by Status</h2>

        <ResponsiveContainer width="100%" height={250}>
          <PieChart>
            <Pie
              data={statusChartData}
              dataKey="value"
              nameKey="name"
              outerRadius={80}
              label
            >
              <Cell fill="#3b82f6" />
              <Cell fill="#f59e0b" />
              <Cell fill="#6366f1" />
              <Cell fill="#22c55e" />
              <Cell fill="#6b7280" />
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

    </div>

      {/* Reports by Project */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <h2 className="text-xl font-semibold mb-4">Reports by Project</h2>

        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={projectChartData}>
            <XAxis dataKey="project" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" fill="#6366f1" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Recent Reports */}
      <div>
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

      <button
        onClick={() => navigate("/new-report")}
        className="mt-6 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded"
      >
        Submit New Report
      </button>

      <Toast
        message={toastMessage}
        type={toastType}
        onClose={() => setToastMessage("")}
      />
    </div>
  );
}
