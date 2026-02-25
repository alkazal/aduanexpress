import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { useNavigate } from "react-router-dom";
//import { syncReports, setSyncStatusListener, setReportSyncedListener } from "../lib/sync";
import { setSyncStatusListener, setReportSyncedListener } from "../lib/syncEvents";

function statusColor(status) {
  if (status === "Open") return "text-yellow-600";
  if (status === "Pending") return "text-orange-600";
  if (status === "Resolved") return "text-green-600";
  return "text-gray-600";
}

export default function MySubmissions() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("idle");
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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Reports</h1>

      {syncStatus === "syncing" && (
        <p className="text-blue-600 font-medium mb-2">Syncing offline reports...</p>
      )}

      {loading && <p>Loading...</p>}

      {!loading && items.length === 0 && (
        <p className="text-gray-500">You have no report submissions yet.</p>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 mt-4">
        {items.map((x) => (
          <div 
              key={x.id}
              onClick={() => navigate(`/report/${x.id}`)}
              className="bg-white shadow rounded-lg p-4 cursor-pointer hover:bg-gray-50"
            >
            {x.attachment_url && (
              <img
                src={x.attachment_url}
                className="w-full h-40 object-cover rounded mb-2"
              />
            )}            
            <h2 className="text-lg font-semibold">{x.title}</h2>
            <p className="font-semibold">{x.report_type}</p>
            <p>
              <b>Ticket No:</b> {x.ticket_no}
            </p>
            {x.project_name && (
              <p>
                <b>Project:</b> {x.project_name}
              </p>
            )}
            <p className="text-sm mt-2">
              <b>Status:</b>{" "}
              <span className={`font-semibold ${statusColor(x.status)}`}>
                {x.status}
              </span>
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Submitted by: {x.submitted_by}
            </p>
            <p className="text-sm text-gray-500">
              Assigned to: {x.assigned_to}
            </p>
            <p className="text-sm text-gray-600">
              {new Date(x.created_at).toLocaleString()}
            </p>

            {!x.synced && <p className="text-red-500 text-xs mt-1">Offline</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
