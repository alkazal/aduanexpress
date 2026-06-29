import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { syncReports } from "../lib/sync";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Select } from "../components/ui/select";

export default function AssignReport() {
  const [reports, setReports] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [selectedTech, setSelectedTech] = useState({});
  const [selectedLevel, setSelectedLevel] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    // // Re-sync when back online
    // const handleOnline = () => {
    //   syncReports();
    //   loadData();
    // };

    // window.addEventListener("online", handleOnline);
    // return () => window.removeEventListener("online", handleOnline);
  }, []);

  // --------------------------
  // LOAD REPORTS + TECHNICIANS
  // --------------------------
  async function loadData() {
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    // Fetch unassigned reports online
    if (navigator.onLine) {
      const { data: reportsData, error: repErr } = await supabase
        .from("reports")
        .select(`
          *,
          project:project_id ( name ),
          reporter:user_id ( full_name )
        `)
        .eq("status", "Submitted")
        .order("created_at", { ascending: false });

      if (repErr) console.error(repErr);
      else {
        const list = (reportsData || []).map((r) => ({
          ...r,
          project_name: r.project?.name || r.project_name || null
        }));
        setReports(list);
      }
    }
    else {
      // OFFLINE fallback
      const offline = await db.reports
        .where("status")
        .equals("Submitted")
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

    // Fetch list of technicians
    const { data: techData, error: techErr } = await supabase
      .from("user_profiles")
      .select("id, full_name")
      .eq("role", "technician");

    if (techErr) console.error(techErr);
    else setTechnicians(techData || []);

    setLoading(false);
  }

  // --------------------------
  // ASSIGN ACTION (offline-first)
  // --------------------------
  async function handleAssign(reportId) {

    const level = selectedLevel[reportId];
    const technicianId = selectedTech[reportId];

    if (!technicianId) return alert("Please select technician");
    if (!level) return alert("Please select maintenance level");

    if (!technicianId) return alert("Please select technician");

    const { data: { session } } = await supabase.auth.getSession();
    const manager = session.user;

    let report = await db.reports.get(reportId);
    if (!report) {
      if (!navigator.onLine) {
        alert("Report not found locally. Please go online and try again.");
        return;
      }

      const { data: onlineReport, error: onlineErr } = await supabase
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .single();

      if (onlineErr || !onlineReport) {
        console.error(onlineErr);
        alert("Report not found. Please sync and try again.");
        return;
      }

      await db.reports.put({ ...onlineReport, synced: true });
      report = onlineReport;
    }
    const oldStatus = report.status || "Submitted";

    // --------------------------
    // Build local status change entry
    // --------------------------
    const historyEntry = {
      old_status: oldStatus,
      new_status: "New",
      changed_by: manager.id,
      changed_by_name: manager.email,
      changed_at: new Date().toISOString()
    };

    const existingChanges = report._status_changes || [];

    // --------------------------
    // 1) Update Dexie offline
    // --------------------------
    await db.reports.update(reportId, {
      maintenance_level: Number(level),
      assigned_to: technicianId,
      assigned_at: new Date().toISOString(),
      status: "New",
      updated_at: new Date().toISOString(),
      updated_by: manager.id,
      synced: false,
      _status_changes: [...existingChanges, historyEntry]
    });

    console.log("historyEntry:", historyEntry);

    // --------------------------
    // 2) Online update if available
    // --------------------------
    if (navigator.onLine) {
      const { error } = await supabase
        .from("reports")
        .update({
          maintenance_level: Number(level),
          assigned_to: technicianId,
          assigned_at: new Date().toISOString(),
          status: "New",
          updated_at: new Date().toISOString(),
          updated_by: manager.id
        })
        .eq("id", reportId);

      if (error) {
        console.error(error);
        alert("Assigned offline — will sync later");
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

    alert("✔ Assigned Successfully");

    // --------------------------
    // 3) Trigger sync & reload
    // --------------------------
    syncReports();
    loadData();

  }

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <Alert>
          <AlertDescription>Loading reports...</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-2 px-2 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Assign Reports</h1>
          <p className="text-gray-500 text-sm">
            View unassigned reports and assign to technicians
          </p>
        </div>
      </div>


      {reports.length === 0 && (
        <Alert>
          <AlertDescription>No reports pending assignment</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5">
        {reports.map((r) => (
          <Card key={r.id} className="shadow-sm hover:shadow-md transition">
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <CardTitle className="text-base">{r.title || "Untitled Report"}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    #{r.ticket_no} | {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Badge variant="secondary">Submitted</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground line-clamp-5">
                {r.description}
              </p>

              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Project: {r.project_name || "-"}</span>
                <span>Maintenance Level: {r.maintenance_level || "-"}</span>
                <span>
                  By: {r.reporter?.full_name || r.reporter_name || r.user_id}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Select
                  className="sm:w-40 shrink-0"
                  value={selectedLevel[r.id] || ""}
                  onChange={(e) =>
                    setSelectedLevel({
                      ...selectedLevel,
                      [r.id]: e.target.value
                    })
                  }
                >
                  <option value="">Maint. Level</option>
                  <option value="1">Level 1</option>
                  <option value="2">Level 2</option>
                  <option value="3">Level 3</option>
                </Select>

                <Select
                  className="flex-1"
                  value={selectedTech[r.id] || ""}
                  onChange={(e) =>
                    setSelectedTech({
                      ...selectedTech,
                      [r.id]: e.target.value
                    })
                  }
                >
                  <option value="">Select Technician</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.full_name}
                    </option>
                  ))}
                </Select>

                <Button
                  onClick={() => handleAssign(r.id)}
                  disabled={!selectedTech[r.id] || !selectedLevel[r.id]}
                >
                  Assign
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
