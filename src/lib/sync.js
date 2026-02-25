import { supabase } from "./supabase";
import { db } from "../db";
import { emitSyncStatus, emitReportSynced } from "./syncEvents";

/* ===============================
   HELPER: Detect MIME TYPE
================================ */
function getMimeType(att) {
  if (att.mime_type) return att.mime_type;
  if (att.file?.type) return att.file.type;

  if (att.file_name) {
    const ext = att.file_name.split(".").pop().toLowerCase();
    const map = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    };

    return map[ext] || "application/octet-stream";
  }

  return "application/octet-stream";
}

// Helper
function safeDate(d) {
  return d || new Date().toISOString();
}

/* ===============================
   SYNC FUNCTION
================================ */
export async function syncReports() {
  console.log("SYNC: starting");
  emitSyncStatus("syncing");

  try {
    /* ---------------------------------
       CHECK USER SESSION
    ----------------------------------*/
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user?.id) {
      console.warn("SYNC: No session");
      emitSyncStatus("login_required");
      return;
    }

    /* =========================================================
       0. SYNC PROJECTS (for selectors + offline display)
    ========================================================== */
    try {
      const { data: onlineProjects, error: projErr } = await supabase
        .from("projects")
        .select("id, name, updated_at")
        .order("name", { ascending: true });

      if (!projErr && onlineProjects) {
        for (const p of onlineProjects) {
          await db.projects.put({
            id: p.id,
            name: p.name,
            updated_at: p.updated_at || null
          });
        }
      }
    } catch (err) {
      console.warn("Projects sync failed:", err);
    }

    /* =========================================================
       1. DELETE ATTACHMENTS (from Dexie → Supabase → Storage)
    ========================================================== */
    const attachmentsToDelete = await db.attachments
      .filter(a => a?.to_delete === true)
      .toArray();

    for (const att of attachmentsToDelete) {
      try {
        console.log("Deleting attachment", att.id);

        // Delete attachment record
        await supabase
          .from("attachments")
          .delete()
          .eq("id", att.id);

        // Remove from Supabase bucket
        if (att.file_url) {
          const path = att.file_url.split("/storage/v1/object/public/attachments/")[1];
          if (path) {
            await supabase.storage
              .from("attachments")
              .remove([path]);
          }
        }

        // Remove from Dexie
        await db.attachments.delete(att.id);
      } catch (err) {
        console.error("❌ Failed to delete attachment:", err);
      }
    }

    /* =========================================================
       2. DELETE REPORTS (cascade delete attachments)
    ========================================================== */
    const reportsToDelete = await db.reports
      .filter(r => r?.to_delete === true)
      .toArray();
    
    console.log("Reports to delete:", reportsToDelete.length);

    for (const rep of reportsToDelete) {
      try {
        console.log("Deleting report", rep.id);

        // Delete from Supabase (report)
        await supabase
          .from("reports")
          .delete()
          .eq("id", rep.id);

        // Delete attachments in Supabase related to report
        const { data: attOnline } = await supabase
          .from("attachments")
          .select("id, file_url")
          .eq("report_id", rep.id);

        if (attOnline) {
          for (const a of attOnline) {
            if (a.file_url) {
              const path = a.file_url.split("/storage/v1/object/public/attachments/")[1];
              if (path) {
                await supabase.storage
                  .from("attachments")
                  .remove([path]);
              }
            }

            await supabase
              .from("attachments")
              .delete()
              .eq("id", a.id);
          }
        }

        // Remove local attachments
        const localAtt = await db.attachments
          .filter(a => a.report_id === rep.id)
          .toArray();

        for (const a of localAtt) {
          await db.attachments.delete(a.id);
        }

        // Remove local report
        await db.reports.delete(rep.id);

      } catch (err) {
        console.error("❌ Failed deleting report:", rep.id, err);
      }
    }

    /* =========================================================
       3. SYNC UNSYNCED REPORTS (INSERT / UPDATE)
    ========================================================== */
    const unsyncedReports = await db.reports
      .filter(r => r && (r.synced === false || r.synced === "false"))
      .toArray();

    console.log("Unsynced reports:", unsyncedReports.length);

    for (const report of unsyncedReports) {

      if (!report.id || typeof report.id !== "string") {
        console.warn("Invalid report id, skipping", report);
        continue;
      }

      const reportId = report.id;

      // ----------------------------------------------------------
      // Build safe payload (NEVER overwrite user_id if exists online)
      // ----------------------------------------------------------
      const payload = {
        id: reportId,
        title: report.title,
        description: report.description,
        report_type: report.report_type,
        project_id: report.project_id || null,
        status: report.status,
        assigned_to: report.assigned_to,
        assigned_at: report.assigned_at,
        created_at: safeDate(report.created_at),
        updated_at: new Date().toISOString(),
      };

      // Only include user_id if this report was created locally first
      if (!report._synced_once) {
        payload.user_id = report.user_id;
      }

      console.log("⬆️ UPSERT:", payload);

      try {
        // UPSERT report       
        const { error: upErr } = await supabase
          .from("reports")
          .upsert(payload, { onConflict: "id" });

        if (upErr) {
          if (upErr.code === '3F000') {
            console.error(
              "🚨 ACTION REQUIRED: The 'pg_net' extension is missing in Supabase.\n" +
              "👉 Go to Supabase Dashboard > Database > Extensions, search for 'pg_net' and Enable it."
            );
            alert("Database Error: 'pg_net' extension missing. Check console for details.");
          } else {
            console.error("❌ Upsert error", upErr);
          }
          continue;
        }


      // START FOR LOG HISTORY 
        const localStatusChanges = report._status_changes || [];
        for (const entry of localStatusChanges) {
          try {
            await supabase.from("report_status_history").insert({
              report_id: reportId,
              old_status: entry.old_status,
              new_status: entry.new_status,
              changed_by: entry.changed_by,
              changed_by_name: entry.changed_by_name,
              changed_at: entry.changed_at,
              comment: entry.comment
            });
          } catch (err) {
            console.error("Failed to push status history:", err);
          }
        }

        // clear local status change buffer
        if (localStatusChanges.length) {
          await db.reports.update(reportId, { _status_changes: [] });
        }
      // END FOR LOG HISTORY

        // Mark that future syncs should NOT include user_id
        await db.reports.update(reportId, {
          synced: true,
          _synced_once: true,
        });

        /* -----------------------------------------
           SYNC ATTACHMENTS FOR THIS REPORT
        ------------------------------------------*/
        const localAttachments = await db.attachments
          .filter(a => a.report_id === report.id && a.synced === false && a.to_delete !== true)
          .toArray();

        for (const att of localAttachments) {
          try {
            const fileBlob = att.file || att.file_data;

            if (!fileBlob) {
              console.warn("Attachment has no blob:", att.id);
              continue;
            }

            const mime = getMimeType(att);

            const ext = (att.file_name || "file").split(".").pop();
            const storagePath = `attachments/${report.id}/${att.id}.${ext}`;

            const { error: uploadError } = await supabase.storage
              .from("attachments")
              .upload(storagePath, fileBlob, { upsert: true });

            if (uploadError) {
              console.error("❌ Upload failed:", uploadError);
              continue;
            }

            const { data: publicData } = supabase.storage
              .from("attachments")
              .getPublicUrl(storagePath);

            const publicUrl = publicData?.publicUrl;

            await supabase
              .from("attachments")
              .upsert({
                id: att.id,
                report_id: report.id,
                user_id: user.id,
                file_url: publicUrl,
                file_name: att.file_name,
                mime_type: mime
              }, { onConflict: "id" });

            await db.attachments.update(att.id, {
              synced: true,
              file_url: publicUrl,
              mime_type: mime
            });

          } catch (err) {
            console.error("❌ Error syncing attachment:", err);
          }
        }

        await db.reports.update(report.id, { synced: true });

        emitReportSynced(report.title || report.description || report.id);

      } catch (err) {
        console.error("❌ Error syncing report:", err);
      }
    }

    /* =========================================================
       4. PULL LATEST REPORTS FROM SUPABASE
    ========================================================== */
    const { data: onlineReports } = await supabase
      .from("reports")
      .select(`
        *,
        reporter:user_id ( full_name ),
        technician:assigned_to ( full_name ),
        project:project_id ( id, name ),
        history:report_status_history(
          id,
          old_status,
          new_status,
          changed_at,
          comment,
          changed_by,
          changed_by_name
        )
      `)
      .eq("user_id", user.id);

    if (onlineReports) {
      for (const r of onlineReports) {
        if (r.project?.id) {
          await db.projects.put({
            id: r.project.id,
            name: r.project.name,
            updated_at: r.project.updated_at || null
          });
        }

        await db.reports.put({
          ...r,
          reporter_name: r.reporter?.full_name || null,
          technician_name: r.technician?.full_name || null,
          project_id: r.project?.id || r.project_id || null,
          project_name: r.project?.name || r.project_name || null,
          synced: true,
          _synced_once: true,
           _status_changes: r._status_changes || []
          //_status_changes: r.history || []
        });
        
        const { data: atts } = await supabase
          .from("attachments")
          .select("*")
          .eq("report_id", r.id);

        if (atts) {
          for (const a of atts) {
            await db.attachments.put({
              id: a.id,
              report_id: r.id,
              user_id: a.user_id,
              file_name: a.file_name,
              file_url: a.file_url,
              mime_type: a.mime_type,
              synced: true,
              file: null,
              file_data: null
            });
          }
        }
      }
    }

    emitSyncStatus("done");
    console.log("✅ SYNC COMPLETE");

  } catch (error) {
    console.error("💥 SYNC ERROR:", error);
    emitSyncStatus("error");
  }
}
