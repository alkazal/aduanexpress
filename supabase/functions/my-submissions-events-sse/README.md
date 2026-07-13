# my-submissions-events-sse

Role-aware SSE stream for the Reports / My Submissions page.

## Endpoint

GET /functions/v1/my-submissions-events-sse?streamToken=<short-lived-token>&userId=<auth-user-id>

## Auth

- Preferred (browser EventSource): short-lived `streamToken` query parameter.
- Optional fallback (non-browser clients): `Authorization` header.

This function uses the same `STREAM_TOKEN_SECRET` token format as `technician-events-sse`.

## Event contract

1. `submission-upsert`
- Insert or update a report list item.

2. `submission-remove`
- Remove item from list.
- Payload:

{
  "id": "<report-id>"
}

3. `snapshot-required`
- Client should run one silent full refresh.

4. `heartbeat`
- Keepalive event every 25 seconds.

## Role behavior

- Manager: receives all report changes.
- Non-manager: receives only rows where `reports.user_id` belongs to the caller.

## Required secrets

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- STREAM_TOKEN_SECRET

## Deploy

supabase functions deploy my-submissions-events-sse --no-verify-jwt
