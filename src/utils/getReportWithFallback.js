import { db } from "../db"
import { supabase } from "../lib/supabase";

export async function getReportWithFallback(reportId) {
  // try local first
  const local = await db.reports.get(reportId);

  if (local) return local;

  // fallback to Supabase
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("id", reportId)
    .single();

  if (error || !data) return null;

  // save to Dexie
  await db.reports.put({
    ...data,
    synced: true
  });

  return data;
}
