import { db } from "../db";
import { supabase } from "../lib/supabase";

export async function getAttachmentsWithFallback(reportId) {
  const local = await db.attachments.where("report_id").equals(reportId).toArray();

  if (local.length > 0) return local;

  // fetch from supabase
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("report_id", reportId);

  if (error || !data) return [];

  // convert remote into Dexie format
  for (const att of data) {
    await db.attachments.put({
      ...att,
      file_data: null,   // online version has no Blob yet
      synced: true
    });
  }

  return data;
}
