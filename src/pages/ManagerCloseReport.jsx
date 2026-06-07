import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { db } from "../db";
import { syncReports } from "../lib/sync";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/textarea";

export default function ManagerCloseReport() {
  const [reports, setReports] = useState([]);
  const [closeNotes, setCloseNotes] = useState({});
  const [loading, setLoading] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    loadReports();

    const handleOnline = () => {
      syncReports();
      loadReports();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  // -------------------------------------------
  // Load all "Resolved" reports (online + offline)
  // -------------------------------------------
  async function loadReports() {
    setLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return navigate("/login");

    let results = [];

    if (navigator.onLine) {
      const { data, error } = await supabase
        .from("reports")
        .select(`
          *,
          assigned_to_profile:assigned_to ( full_name ),
          created_by_profile:user_id ( full_name )
        `)
        .eq("status", "Resolved")
        .order("updated_at", { ascending: false });

      if (!error && data) results = data;
    } else {
      // Offline fallback
      results = await db.reports
        .where("status")
        .equals("Resolved")
        .toArray();
    }

    setReports(results);
    setLoading(false);
  }

  // -------------------------------------------
  // Close Report (Offline-first)
  // -------------------------------------------
  async function closeReport(report) {
    const closingNote = closeNotes[report.id];

    if (!closingNote || closingNote.trim() === "") {
      alert("Please enter closing notes before closing");
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const manager = session.user;
    const now = new Date().toISOString();

    const historyEntry = {
      old_status: "Resolved",
      new_status: "Closed",
      changed_by: manager.id,
      changed_by_name: manager.email,
      changed_at: now,
      comment: closingNote
    };

    const existingHistory = report._status_changes || [];

    // 1️⃣ Update Dexie first
    await db.reports.update(report.id, {
      status: "Closed",
      closing_notes: closingNote,
      closed_at: now,
      updated_at: now,
      updated_by: manager.id,
      synced: false,
      _status_changes: [...existingHistory, historyEntry]
    });

    // 2️⃣ Push to Supabase if online
    if (navigator.onLine) {
      const { error } = await supabase
        .from("reports")
        .update({
          status: "Closed",
          closing_notes: closingNote,
          closed_at: now,
          updated_at: now,
          updated_by: manager.id
        })
        .eq("id", report.id);

      if (error) {
        console.error("Close error:", error);
        alert("Closed offline — will sync later");
      }
      if (!error) {
        const { error: historyError } = await supabase
          .from("report_status_history")
          .insert({
            report_id: report.id,
            old_status: historyEntry.old_status,
            new_status: historyEntry.new_status,
            changed_by: historyEntry.changed_by,
            changed_by_name: historyEntry.changed_by_name,
            changed_at: historyEntry.changed_at,
            comment: historyEntry.comment
          });

        if (historyError) {
          console.error("History insert failed:", historyError);
        }
        // Mark local row synced to avoid duplicate UPSERT later
        await db.reports.update(report.id, {
          synced: true,
          ...(historyError ? {} : { _status_changes: [] })
        });
      }
    }

    alert("✔ Report closed successfully");
    syncReports();
    loadReports();
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <Alert>
          <AlertDescription>Loading...</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Close Reports</h1>
          <p className="text-gray-500 text-sm">
            View resolved reports and close with final notes 
          </p>
        </div>
      </div>

      {reports.length === 0 && (
        <Alert>
          <AlertDescription>No reports waiting for closure</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
      {reports.map((r) => (
        <Card key={r.id} className="shadow-sm hover:shadow-md transition">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-xs text-muted-foreground">
                  #{r.ticket_no} | {new Date(r.updated_at).toLocaleDateString()}
                </p>
                <CardTitle className="text-base">{r.title}</CardTitle>
              </div>

              <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">
                Resolved
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground line-clamp-2">
              {r.description}
            </p>

            <div className="flex justify-between text-xs text-muted-foreground mb-3">
              <span>
                Assigned: <b>{r.assigned_to_profile?.full_name || r.assigned_to}</b>
              </span>

              <span>
                Reported: <b>{r.created_by_profile?.full_name || r.user_id}</b>
              </span>
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">
                Closing Notes
              </p>

              <Textarea
                rows={2}
                placeholder="Enter final resolution details..."
                value={closeNotes[r.id] || ""}
                onChange={(e) =>
                  setCloseNotes({
                    ...closeNotes,
                    [r.id]: e.target.value
                  })
                }
              />
            </div>

            <div className="flex justify-end mt-3">
              <Button
                onClick={() => closeReport(r)}
                className="bg-green-600 hover:bg-green-700"
              >
                Close Report
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
    </div>
  );
}
