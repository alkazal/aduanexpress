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
  const { data, error } = await supabase.functions.invoke(tokenFunctionName, {
    body: { userId },
  });
  if (error) throw new Error(error.message || "Failed to create stream token");
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
