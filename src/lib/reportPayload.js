const REPORT_SERVER_FIELDS = [
  "id",
  "user_id",
  "title",
  "description",
  "requestor_name",
  "requestor_phone_no",
  "request_datetime",
  "report_type",
  "project_id",
  "status",
  "assigned_to",
  "assigned_at",
  "maintenance_level",
  "closing_notes",
  "closed_at",
  "created_at",
  "updated_at",
  "updated_by"
];

export function toReportServerPayload(report, options = {}) {
  const { includeId = true, includeUserId = true } = options;
  const payload = {};

  for (const key of REPORT_SERVER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(report, key)) continue;
    if (report[key] === undefined) continue;
    payload[key] = report[key];
  }

  if (!includeId) delete payload.id;
  if (!includeUserId) delete payload.user_id;

  if (Object.prototype.hasOwnProperty.call(payload, "project_id") && !payload.project_id) {
    payload.project_id = null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "assigned_to") && !payload.assigned_to) {
    payload.assigned_to = null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "assigned_at") && !payload.assigned_at) {
    payload.assigned_at = null;
  }

  return payload;
}
