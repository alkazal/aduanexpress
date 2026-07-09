# create-technician-stream-token

Supabase Edge Function that issues short-lived SSE stream tokens for authenticated technicians.

## Why this exists

Native browser EventSource cannot send Authorization headers.
This function lets the frontend get a short-lived signed token first, then connect to SSE using query parameter streamToken.

## Endpoint

POST /functions/v1/create-technician-stream-token

Required header:
- Authorization: Bearer <access_token>

Optional body:

{
  "userId": "<auth-user-id>"
}

If userId is provided, it must match the authenticated caller.

## Response

{
  "streamToken": "<signed-token>",
  "expiresIn": 120,
  "userId": "<auth-user-id>"
}

## Required secrets

- SUPABASE_URL
- SUPABASE_ANON_KEY
- STREAM_TOKEN_SECRET

Optional:
- STREAM_TOKEN_TTL_SECONDS (default 120)

## Deploy

supabase functions deploy create-technician-stream-token
