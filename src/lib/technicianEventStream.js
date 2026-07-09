import { supabase } from "./supabase";

const DEFAULT_TOKEN_FUNCTION_NAME = "create-technician-stream-token";
const DEFAULT_SSE_FUNCTION_NAME = "technician-events-sse";

function getDefaultTechnicianStreamPath() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return "/api/technician-events";
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

  if (error) {
    throw new Error(error.message || "Failed to create technician stream token");
  }

  if (!data?.streamToken) {
    throw new Error("Token response missing streamToken");
  }

  return data.streamToken;
}

export async function createTechnicianEventStream({
  userId,
  path = import.meta.env.VITE_TECHNICIAN_SSE_URL || getDefaultTechnicianStreamPath(),
  tokenFunctionName =
    import.meta.env.VITE_TECHNICIAN_STREAM_TOKEN_FUNCTION || DEFAULT_TOKEN_FUNCTION_NAME,
  onOpen,
  onError,
  onReportUpsert,
  onReportRemove,
  onSnapshotRequired,
}) {
  if (!userId) {
    throw new Error("createTechnicianEventStream requires userId");
  }

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

      nextSource.addEventListener("report-upsert", (event) => {
        if (source !== nextSource || closed) return;
        const payload = parseEventData(event.data);
        if (payload) onReportUpsert?.(payload);
      });

      nextSource.addEventListener("report-remove", (event) => {
        if (source !== nextSource || closed) return;
        const payload = parseEventData(event.data);
        if (payload?.id) onReportRemove?.(payload);
      });

      nextSource.addEventListener("snapshot-required", (event) => {
        if (source !== nextSource || closed) return;
        const payload = parseEventData(event.data);
        onSnapshotRequired?.(payload);
      });

      nextSource.onmessage = (event) => {
        if (source !== nextSource || closed) return;
        const payload = parseEventData(event.data);
        if (!payload?.type) return;

        if (payload.type === "report-upsert") {
          onReportUpsert?.(payload.data || payload);
        }

        if (payload.type === "report-remove") {
          onReportRemove?.(payload.data || payload);
        }

        if (payload.type === "snapshot-required") {
          onSnapshotRequired?.(payload.data || payload);
        }
      };
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
