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

  const streamToken = await getStreamToken(userId, tokenFunctionName);

  const streamUrl = new URL(path, window.location.origin);
  streamUrl.searchParams.set("streamToken", streamToken);
  streamUrl.searchParams.set("userId", userId);

  const source = new EventSource(streamUrl.toString(), { withCredentials: false });

  source.addEventListener("open", (event) => {
    onOpen?.(event);
  });

  source.addEventListener("error", (event) => {
    onError?.(event);
  });

  source.addEventListener("report-upsert", (event) => {
    const payload = parseEventData(event.data);
    if (payload) onReportUpsert?.(payload);
  });

  source.addEventListener("report-remove", (event) => {
    const payload = parseEventData(event.data);
    if (payload?.id) onReportRemove?.(payload);
  });

  source.addEventListener("snapshot-required", (event) => {
    const payload = parseEventData(event.data);
    onSnapshotRequired?.(payload);
  });

  source.onmessage = (event) => {
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

  return {
    close() {
      source.close();
    },
  };
}
