import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type TokenPayload = {
  sub: string;
  exp: number;
};

function toBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signHmacSha256(secret: string, message: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return new Uint8Array(sigBuffer);
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonError(405, "Method not allowed");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const streamTokenSecret = Deno.env.get("STREAM_TOKEN_SECRET");
  const ttlSeconds = Number(Deno.env.get("STREAM_TOKEN_TTL_SECONDS") || "120");

  if (!supabaseUrl || !anonKey) {
    return jsonError(500, "Missing SUPABASE_URL or SUPABASE_ANON_KEY");
  }

  if (!streamTokenSecret) {
    return jsonError(500, "Missing STREAM_TOKEN_SECRET");
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonError(401, "Missing Authorization header");
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return jsonError(401, "Unauthorized");
  }

  const body = await req.json().catch(() => ({}));
  const requestedUserId = body?.userId;

  if (requestedUserId && requestedUserId !== user.id) {
    return jsonError(403, "Forbidden: userId does not match caller");
  }

  const payload: TokenPayload = {
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const payloadPart = toBase64Url(payloadBytes);
  const signatureBytes = await signHmacSha256(streamTokenSecret, payloadPart);
  const signaturePart = toBase64Url(signatureBytes);
  const streamToken = `${payloadPart}.${signaturePart}`;

  return new Response(
    JSON.stringify({ streamToken, expiresIn: ttlSeconds, userId: user.id }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
