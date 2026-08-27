import { supabase } from "./supabase";

const DEFAULT_TOKEN_FUNCTION_NAME = "create-technician-stream-token";
const DEFAULT_SSE_FUNCTION_NAME = "report-details-sse";

function getDefaultPath() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return "/api/report-details-events";
  return `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${DEFAULT_SSE_FUNCTION_NAME}`;
}

function parseEventData(rawData) {
  if (!rawData) return null;
  try {
    return JSON.parse(rawData);
  } catch {
    return null;
  }
}

async function getStreamToken(userId, tokenFunctionName) {
  await supabase.auth.getUser();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("No active Supabase session available for report details stream token request");
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
  }

  const endpoint = `${baseUrl.replace(/\/$/, "")}/functions/v1/${tokenFunctionName}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      userId,
      accessToken: session.access_token,
    }),
  });

  const rawBody = await response.text();
  let data = null;
  try {
    data = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error ||
      data?.message ||
      `Failed to create stream token (${response.status})`;
    throw new Error(message);
  }

  if (!data?.streamToken) throw new Error("Token response missing streamToken");
  return data.streamToken;
}

export async function createReportDetailsEventStream({
  reportId,
  userId,
  path = import.meta.env.VITE_REPORT_DETAILS_SSE_URL || getDefaultPath(),
  tokenFunctionName =
    import.meta.env.VITE_TECHNICIAN_STREAM_TOKEN_FUNCTION || DEFAULT_TOKEN_FUNCTION_NAME,
  onOpen,
  onError,
  onReportUpdated,
  onCommentUpsert,
  onCommentRemove,
  onAttachmentUpsert,
  onAttachmentRemove,
  onSnapshotRequired,
}) {
  if (!reportId) throw new Error("createReportDetailsEventStream requires reportId");
  if (!userId) throw new Error("createReportDetailsEventStream requires userId");

  let source = null;
  let closed = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;

  function clearReconnectTimer() {
    if (!reconnectTimer) return;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function scheduleReconnect() {
    if (closed || reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** reconnectAttempt);
    reconnectAttempt += 1;
    reconnectTimer = window.setTimeout(async () => {
      reconnectTimer = null;
      await connectWithFreshToken();
    }, delay);
  }

  async function connectWithFreshToken() {
    if (closed) return;

    try {
      const streamToken = await getStreamToken(userId, tokenFunctionName);
      if (closed) return;

      const streamUrl = new URL(path, window.location.origin);
      streamUrl.searchParams.set("reportId", reportId);
      streamUrl.searchParams.set("streamToken", streamToken);
      streamUrl.searchParams.set("userId", userId);

      const nextSource = new EventSource(streamUrl.toString(), { withCredentials: false });
      source = nextSource;

      nextSource.addEventListener("open", (event) => {
        if (source !== nextSource || closed) return;
        reconnectAttempt = 0;
        onOpen?.(event);
      });

      nextSource.addEventListener("error", (event) => {
        if (source !== nextSource || closed) return;
        onError?.(event);
        nextSource.close();
        source = null;
        scheduleReconnect();
      });

      nextSource.addEventListener("report-updated", (event) => {
        if (source !== nextSource || closed) return;
        const payload = parseEventData(event.data);
        if (payload) onReportUpdated?.(payload);
      });

      nextSource.addEventListener("comment-upsert", (event) => {
        if (source !== nextSource || closed) return;
        const payload = parseEventData(event.data);
        if (payload) onCommentUpsert?.(payload);
      });

      nextSource.addEventListener("comment-remove", (event) => {
        if (source !== nextSource || closed) return;
        const payload = parseEventData(event.data);
        if (payload?.id) onCommentRemove?.(payload);
      });

      nextSource.addEventListener("attachment-upsert", (event) => {
        if (source !== nextSource || closed) return;
        const payload = parseEventData(event.data);
        if (payload) onAttachmentUpsert?.(payload);
      });

      nextSource.addEventListener("attachment-remove", (event) => {
        if (source !== nextSource || closed) return;
        const payload = parseEventData(event.data);
        if (payload?.id) onAttachmentRemove?.(payload);
      });

      nextSource.addEventListener("snapshot-required", (event) => {
        if (source !== nextSource || closed) return;
        const payload = parseEventData(event.data);
        onSnapshotRequired?.(payload);
      });
    } catch (error) {
      onError?.(error);
      scheduleReconnect();
    }
  }

  await connectWithFreshToken();

  return {
    close() {
      closed = true;
      clearReconnectTimer();
      source?.close();
      source = null;
    },
  };
}
