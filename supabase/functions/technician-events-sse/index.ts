import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type StreamEvent =
  | { event: "report-upsert"; data: Record<string, unknown> }
  | { event: "report-remove"; data: { id: string } }
  | { event: "snapshot-required"; data: { reason: string } }
  | { event: "heartbeat"; data: { ts: string } };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

type StreamTokenPayload = {
  sub: string;
  exp: number;
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

async function verifyHmacSha256(secret: string, message: string, signature: Uint8Array): Promise<boolean> {
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

async function validateStreamToken(streamToken: string, secret: string): Promise<StreamTokenPayload | null> {
  const [payloadPart, signaturePart] = streamToken.split(".");
  if (!payloadPart || !signaturePart) return null;

  const payloadBytes = fromBase64Url(payloadPart);
  const signatureBytes = fromBase64Url(signaturePart);
  const signatureValid = await verifyHmacSha256(secret, payloadPart, signatureBytes);
  if (!signatureValid) return null;

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
    return jsonError(500, "Missing SUPABASE_URL, SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY");
  }

  const url = new URL(req.url);
  const streamToken = url.searchParams.get("streamToken");
  const requestedUserId = url.searchParams.get("userId");
  const authHeader = req.headers.get("Authorization");

  let userId: string | null = null;

  if (streamToken) {
    if (!streamTokenSecret) {
      return jsonError(500, "Missing STREAM_TOKEN_SECRET");
    }

    const tokenPayload = await validateStreamToken(streamToken, streamTokenSecret);
    if (!tokenPayload) {
      return jsonError(401, "Invalid or expired streamToken");
    }

    userId = tokenPayload.sub;
  } else {
    if (!authHeader) {
      return jsonError(401, "Missing Authorization header or streamToken");
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

    userId = user.id;
  }

  if (!userId) {
    return jsonError(401, "Unauthorized");
  }

  if (requestedUserId && requestedUserId !== userId) {
    return jsonError(403, "Forbidden: userId does not match caller");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

      const abortHandler = () => {
        close();
      };
      req.signal.addEventListener("abort", abortHandler);

      // The browser auto-reconnects when EventSource disconnects.
      // We send snapshot-required once so client can perform a full refresh.
      write(
        sseFrame({
          event: "snapshot-required",
          data: { reason: "stream-connected" },
        })
      );

      // Keep intermediaries from closing idle streams.
      const heartbeatTimer = setInterval(() => {
        if (closed) return;
        write(
          sseFrame({
            event: "heartbeat",
            data: { ts: new Date().toISOString() },
          })
        );
      }, 25000);

      const channel = adminClient
        .channel(`technician-events:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "reports",
          },
          (payload) => {
            if (closed) return;

            const newRow = (payload.new || {}) as Record<string, unknown>;
            const oldRow = (payload.old || {}) as Record<string, unknown>;
            const newAssignedTo = typeof newRow.assigned_to === "string" ? newRow.assigned_to : null;
            const oldAssignedTo = typeof oldRow.assigned_to === "string" ? oldRow.assigned_to : null;

            const isNowAssignedToTechnician = newAssignedTo === userId;
            const wasAssignedToTechnician = oldAssignedTo === userId;

            // INSERT for rows assigned to this technician
            if (payload.eventType === "INSERT" && isNowAssignedToTechnician) {
              write(
                sseFrame({
                  event: "report-upsert",
                  data: newRow,
                })
              );
              return;
            }

            // UPDATE can be either upsert (assigned to technician) or remove (moved away)
            if (payload.eventType === "UPDATE") {
              if (isNowAssignedToTechnician) {
                write(
                  sseFrame({
                    event: "report-upsert",
                    data: newRow,
                  })
                );
                return;
              }

              if (wasAssignedToTechnician && !isNowAssignedToTechnician) {
                const oldId = typeof oldRow.id === "string" ? oldRow.id : null;
                if (oldId) {
                  write(
                    sseFrame({
                      event: "report-remove",
                      data: { id: oldId },
                    })
                  );
                }
                return;
              }
            }

            // DELETE for rows that were assigned to this technician
            if (payload.eventType === "DELETE" && wasAssignedToTechnician) {
              const oldId = typeof oldRow.id === "string" ? oldRow.id : null;
              if (oldId) {
                write(
                  sseFrame({
                    event: "report-remove",
                    data: { id: oldId },
                  })
                );
              }
            }
          }
        )
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            if (!closed) {
              write(
                sseFrame({
                  event: "snapshot-required",
                  data: { reason: "channel-error" },
                })
              );
            }
          }
        });

      req.signal.addEventListener(
        "abort",
        async () => {
          clearInterval(heartbeatTimer);
          await adminClient.removeChannel(channel);
          close();
        },
        { once: true }
      );
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
