import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { useNavigate } from "react-router-dom";
//import Toast from "../components/Toast";
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

    // Listen to sync status changes
    setSyncStatusListener((status) => {
      setSyncStatus(status);
      if (status === "done") loadReports();
    });

    return () => clearSyncListeners();

  }, []);

  const totalReports = reports.length;
  const pendingSync = reports.filter(r => !r.synced).length;
  const recentReports = reports.slice(0, 5);

  const statusCounts = reports.reduce(
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
    online: reports.filter(r => r.report_type === type && r.synced).length,
    offline: reports.filter(r => r.report_type === type && !r.synced).length,
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
      <div class="max-w-[100rem] px-4 py-10 sm:px-6 lg:px-8 lg:py-14 mx-auto">
        <div class="grid items-center lg:grid-cols-12 gap-6 lg:gap-12">
          <div class="lg:col-span-2">
            <div class="lg:pe-6 xl:pe-12">
              <p class="text-6xl font-bold leading-10 text-primary">
                {totalReports}               
              </p>
              <p class="mt-2 sm:mt-3 text-muted-foreground-1">Total Reports</p>
            </div>
          </div>

          <div class="lg:col-span-8 relative lg:before:absolute lg:before:top-0 lg:before:-start-12 lg:before:w-px lg:before:h-full lg:before:bg-surface-1">
            <h4 class="text-lg sm:text-xl font-semibold text-foreground">Report Status</h4>
            <div class="grid gap-6 grid-cols-2 md:grid-cols-4 lg:grid-cols-7 sm:gap-8">
              <div>
                <p class="text-3xl font-semibold text-primary">{statusCounts.NEW}</p>
                <p class="mt-1 text-muted-foreground-1">NEW</p>
              </div>

              <div>
                <p class="text-3xl font-semibold text-primary">{statusCounts.OPEN}</p>
                <p class="mt-1 text-muted-foreground-1">OPEN</p>
              </div>

              <div>
                <p class="text-3xl font-semibold text-primary">{statusCounts.PENDING}</p>
                <p class="mt-1 text-muted-foreground-1">PENDING</p>
              </div>

              <div>
                <p class="text-3xl font-semibold text-primary">{statusCounts.RESOLVED}</p>
                <p class="mt-1 text-muted-foreground-1">RESOLVED</p>
              </div>

              <div>
                <p class="text-3xl font-semibold text-primary">{statusCounts.CLOSED}</p>
                <p class="mt-1 text-muted-foreground-1">CLOSED</p>
              </div>

              <div>
                <p class="text-3xl font-semibold text-primary">{pendingSync}</p>
                <p class="mt-1 text-muted-foreground-1">PENDING SYNC</p>
              </div>

              <div>
                <p class="text-3xl font-semibold text-primary">{recentReports.length}</p>
                <p class="mt-1 text-muted-foreground-1">RECENT REPORTS</p>
              </div>

            </div>
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

      {/* <Toast
        message={toastMessage}
        onClose={() => setToastMessage("")}
      /> */}
    </div>
  );
}
