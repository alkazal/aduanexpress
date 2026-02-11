import { useEffect } from "react";
import { supabase } from "./supabase";

export function usePushWorker() {
  useEffect(() => {
    console.log("🚀 Push worker started");

    const channel = supabase
      .channel("notification-queue")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notification_queue",
        },
        async (payload) => {
          console.log("📨 Queue event:", payload.new);

          const row = payload.new;

          // Call Edge Function
          const { data, error } = await supabase.functions.invoke("send-push", {
            body: {
              userId: row.user_id,
              title: row.title,
              body: row.body,
            },
          });

          if (error) {
            console.error("❌ Push failed", error);
          } else {
            console.log("✅ Push sent", data);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
