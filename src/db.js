import Dexie from "dexie";

export const db = new Dexie("report_db");

// db.version(2).stores({
//   reports: "id, report_type, title, description, synced, to_delete, created_at, user_id",
//   attachments: "id, report_id, user_id, synced, to_delete"
// });
db.version(6).stores({
  reports: `
    id,
    user_id,
    assigned_to,
    reporter_name,
    technician_name,
    project_id,
    project_name,
    ticket_no,
    report_type,
    title,
    description,
    status,
    synced,
    to_delete,
    created_at,
    updated_at,
    _status_changes
  `,
  attachments: `
    id,
    report_id,
    user_id,
    file_name,
    file_url,
    synced,
    to_delete
  `,
  projects: `
    id,
    name,
    updated_at
  `,
  pendingDeletes: "id" 
});