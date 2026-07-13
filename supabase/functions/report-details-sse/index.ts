import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type StreamEvent =
  | { event: "report-updated"; data: Record<string, unknown> }
  | { event: "comment-upsert"; data: Record<string, unknown> }
  | { event: "comment-remove"; data: { id: string } }
  | { event: "attachment-upsert"; data: Record<string, unknown> }
  | { event: "attachment-remove"; data: { id: string } }
  | { event: "snapshot-required"; data: { reason: string } }
  | { event: "heartbeat"; data: { ts: string } };

type StreamTokenPayload = {
  sub: string;
  exp: number;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function fromBase64Url(base64Url: string): Uint8Array {
  const base64 = base64Url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifyHmacSha256(
  secret: string,
  message: string,
  signature: Uint8Array
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, signature, encoder.encode(message));
}

async function validateStreamToken(
  streamToken: string,
  secret: string
): Promise<StreamTokenPayload | null> {
  const [payloadPart, signaturePart] = streamToken.split(".");
  if (!payloadPart || !signaturePart) return null;

  const payloadBytes = fromBase64Url(payloadPart);
  const signatureBytes = fromBase64Url(signaturePart);
  const valid = await verifyHmacSha256(secret, payloadPart, signatureBytes);
  if (!valid) return null;

  let payload: StreamTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as StreamTokenPayload;
  } catch {
    return null;
  }

  if (!payload?.sub || !payload?.exp) return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function sseFrame(event: StreamEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
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

  if (req.method !== "GET") {
    return jsonError(405, "Method not allowed");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const streamTokenSecret = Deno.env.get("STREAM_TOKEN_SECRET");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonError(500, "Missing required env vars");
  }

  const url = new URL(req.url);
  const reportId = url.searchParams.get("reportId");
  const streamToken = url.searchParams.get("streamToken");
  const requestedUserId = url.searchParams.get("userId");
  const authHeader = req.headers.get("Authorization");

  if (!reportId) {
    return jsonError(400, "Missing reportId query parameter");
  }

  // ---- Auth ----
  let userId: string | null = null;

  if (streamToken) {
    if (!streamTokenSecret) return jsonError(500, "Missing STREAM_TOKEN_SECRET");
    const tokenPayload = await validateStreamToken(streamToken, streamTokenSecret);
    if (!tokenPayload) return jsonError(401, "Invalid or expired streamToken");
    userId = tokenPayload.sub;
  } else {
    if (!authHeader) return jsonError(401, "Missing Authorization header or streamToken");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return jsonError(401, "Unauthorized");
    userId = user.id;
  }

  if (!userId) return jsonError(401, "Unauthorized");
  if (requestedUserId && requestedUserId !== userId) {
    return jsonError(403, "Forbidden: userId does not match caller");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- Access check: caller must own the report, be assigned to it, or be manager/technician ----
  const { data: profile } = await adminClient
    .from("user_profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const isStaff = profile?.role === "manager" || profile?.role === "technician";

  if (!isStaff) {
    const { data: reportRow, error: reportError } = await adminClient
      .from("reports")
      .select("user_id, assigned_to")
      .eq("id", reportId)
      .single();

    if (reportError || !reportRow) return jsonError(404, "Report not found");

    const isOwner = reportRow.user_id === userId;
    const isAssigned = reportRow.assigned_to === userId;

    if (!isOwner && !isAssigned) {
      return jsonError(403, "Forbidden: you do not have access to this report");
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const write = (chunk: string) => controller.enqueue(encoder.encode(chunk));

      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };

      req.signal.addEventListener("abort", () => close());

      write(sseFrame({ event: "snapshot-required", data: { reason: "stream-connected" } }));

      const heartbeatTimer = setInterval(() => {
        if (closed) return;
        write(sseFrame({ event: "heartbeat", data: { ts: new Date().toISOString() } }));
      }, 25000);

      const channel = adminClient
        .channel(`report-details:${reportId}`)

        // Report row changes
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "reports", filter: `id=eq.${reportId}` },
          (payload) => {
            if (closed) return;
            write(sseFrame({ event: "report-updated", data: payload.new as Record<string, unknown> }));
          }
        )

        // Comment inserts and updates
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "report_comments", filter: `report_id=eq.${reportId}` },
          (payload) => {
            if (closed) return;
            write(sseFrame({ event: "comment-upsert", data: payload.new as Record<string, unknown> }));
          }
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "report_comments", filter: `report_id=eq.${reportId}` },
          (payload) => {
            if (closed) return;
            write(sseFrame({ event: "comment-upsert", data: payload.new as Record<string, unknown> }));
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "report_comments", filter: `report_id=eq.${reportId}` },
          (payload) => {
            if (closed) return;
            const oldId = typeof (payload.old as Record<string, unknown>)?.id === "string"
              ? (payload.old as Record<string, unknown>).id as string
              : null;
            if (oldId) write(sseFrame({ event: "comment-remove", data: { id: oldId } }));
          }
        )

        // Attachment changes
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "attachments", filter: `report_id=eq.${reportId}` },
          (payload) => {
            if (closed) return;
            write(sseFrame({ event: "attachment-upsert", data: payload.new as Record<string, unknown> }));
          }
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "attachments", filter: `report_id=eq.${reportId}` },
          (payload) => {
            if (closed) return;
            const oldId = typeof (payload.old as Record<string, unknown>)?.id === "string"
              ? (payload.old as Record<string, unknown>).id as string
              : null;
            if (oldId) write(sseFrame({ event: "attachment-remove", data: { id: oldId } }));
          }
        )

        .subscribe((status) => {
          if ((status === "CHANNEL_ERROR" || status === "TIMED_OUT") && !closed) {
            write(sseFrame({ event: "snapshot-required", data: { reason: "channel-error" } }));
          }
        });

      req.signal.addEventListener("abort", async () => {
        clearInterval(heartbeatTimer);
        await adminClient.removeChannel(channel);
        close();
      }, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
