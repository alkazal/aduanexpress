# technician-events-sse

Supabase Edge Function that streams technician dashboard events over Server-Sent Events (SSE).

## Can this run on Supabase Edge Functions?

Yes. Supabase Edge Functions can return streaming responses, including text/event-stream.

Use this for moderate realtime workloads and simple one-way browser updates.
For very high fan-out or strict always-on low-latency guarantees, Supabase Realtime or a dedicated stream service may still be better because Edge Functions are request-lifetime based and depend on platform/runtime limits.

## Endpoint

GET /functions/v1/technician-events-sse?streamToken=<short-lived-token>&userId=<auth-user-id>

Auth options:
- Preferred for browser EventSource: streamToken query parameter.
- Optional fallback for non-browser clients: Authorization: Bearer <access_token> header.

## Security model

- For streamToken flow, token signature and expiration are verified using STREAM_TOKEN_SECRET.
- Token subject user id is used as technician scope.
- If userId query parameter is provided, it must match token subject.
- Function rejects mismatched user id with HTTP 403.

## SSE event contract

1. snapshot-required
- Purpose: client should run a full refresh using existing load flow.
- Emitted when stream starts and when backend channel errors occur.
- Payload:

{
  "reason": "stream-connected"
}

2. heartbeat
- Purpose: keep connection alive through proxies and CDNs.
- Interval: every 25s.
- Payload:

{
  "ts": "2026-07-09T10:00:00.000Z"
}

3. report-upsert
- Purpose: insert or update a report row in dashboard state.
- Triggered by INSERT and UPDATE on public.reports assigned_to = user.id.
- Payload: the report row object from Postgres change payload.

4. report-remove
- Purpose: remove a report row from dashboard state.
- Triggered by DELETE on public.reports where old row matched assigned_to filter.
- Payload:

{
  "id": "<report-id>"
}

## Behavior notes

- EventSource in browser auto-reconnects.
- On reconnect, client should treat stream as potentially lossy and perform one snapshot refresh.
- This function emits snapshot-required at connection start to keep client state safe.

## Deploy

supabase functions deploy technician-events-sse
supabase functions deploy create-technician-stream-token

## Local run

supabase functions serve technician-events-sse --no-verify-jwt

If you disable JWT verification locally, remove the Authorization requirement only for local testing.

## Example browser usage

1. Invoke create-technician-stream-token via supabase.functions.invoke with session auth.
2. Build SSE URL with streamToken and userId.
3. Open native EventSource.

## Required secrets

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- STREAM_TOKEN_SECRET
