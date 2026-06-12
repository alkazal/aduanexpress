# send-manager-report-email

Supabase Edge Function that emails all users with role `manager` whenever a new report is successfully synced.

## Required Secrets

Set these in Supabase Edge Functions secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `EMAIL_FROM` (example: `AduanExpress <noreply@yourdomain.com>`)
- `APP_URL` (optional, used to build report link)

## Deploy

```bash
supabase functions deploy send-manager-report-email
```

This function expects authenticated invoke calls from the app and validates the caller via `Authorization` header.

## Test

```bash
supabase functions invoke send-manager-report-email \
  --body '{
    "reportId":"test-id",
    "title":"Network down",
    "description":"Office connection is unstable",
    "projectName":"HQ",
    "requestorName":"Rizal",
    "requestDatetime":"2026-06-12T10:00:00.000Z"
  }'
```
