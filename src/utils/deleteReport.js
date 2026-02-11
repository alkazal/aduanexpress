import { db } from "../db";

export async function deleteReport(report) {
  if (!report.synced) {
    // never uploaded to Supabase
    return db.reports.delete(report.id);
  }

  // Mark for deletion — syncReports() will delete from Supabase
  return db.reports.update(report.id, {
    to_delete: true,
    synced: false,
  });
}
