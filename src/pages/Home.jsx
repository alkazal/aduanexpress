import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { useNavigate } from "react-router-dom";
import Toast from "../components/Toast";
import { setSyncStatusListener, setReportSyncedListener, clearSyncListeners } from "../lib/syncEvents";
//import { startNotificationListener } from "../lib/notificationListener";


import {  
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">
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
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <h3 class="text-lg font-bold text-foreground mb-4">Report Status</h3>
        
        <div class="flex items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-200">
          <div>
            <p class="text-4xl font-bold text-primary">{totalReports}</p>
            <p class="text-sm text-gray-600 mt-1">Total Reports</p>
          </div>
          <div class="w-full max-w-xs">
            <select
              class="w-full border border-gray-300 rounded-md p-2 text-sm"
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
        </div>

        <div class="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
          <div class="border border-gray-300 rounded-lg p-4 bg-gray-50 text-center">
            <p class="text-2xl font-bold text-primary">{statusCounts.NEW}</p>
            <p class="mt-2 text-xs font-medium text-gray-600">NEW</p>
          </div>

          <div class="border border-gray-300 rounded-lg p-4 bg-gray-50 text-center">
            <p class="text-2xl font-bold text-primary">{statusCounts.OPEN}</p>
            <p class="mt-2 text-xs font-medium text-gray-600">OPEN</p>
          </div>

          <div class="border border-gray-300 rounded-lg p-4 bg-gray-50 text-center">
            <p class="text-2xl font-bold text-primary">{statusCounts.PENDING}</p>
            <p class="mt-2 text-xs font-medium text-gray-600">PENDING</p>
          </div>

          <div class="border border-gray-300 rounded-lg p-4 bg-gray-50 text-center">
            <p class="text-2xl font-bold text-primary">{statusCounts.RESOLVED}</p>
            <p class="mt-2 text-xs font-medium text-gray-600">RESOLVED</p>
          </div>

          <div class="border border-gray-300 rounded-lg p-4 bg-gray-50 text-center">
            <p class="text-2xl font-bold text-primary">{statusCounts.CLOSED}</p>
            <p class="mt-2 text-xs font-medium text-gray-600">CLOSED</p>
          </div>

          <div class="border border-gray-300 rounded-lg p-4 bg-gray-50 text-center">
            <p class="text-2xl font-bold text-primary">{pendingSync}</p>
            <p class="mt-2 text-xs font-medium text-gray-600">PENDING SYNC</p>
          </div>

          <div class="border border-gray-300 rounded-lg p-4 bg-gray-50 text-center">
            <p class="text-2xl font-bold text-primary">{recentReports.length}</p>
            <p class="mt-2 text-xs font-medium text-gray-600">RECENT REPORTS</p>
          </div>
        </div>
      </div>
     

      {/* Stacked Chart */}
      <div className="bg-white shadow rounded-lg p-4 mb-6">
        <h2 className="text-xl font-semibold mb-4">Reports by Type (Online vs Offline)</h2>
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
                  className="bg-white shadow rounded-lg p-4 cursor-pointer hover:bg-gray-50"
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
