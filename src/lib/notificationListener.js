import { supabase } from "./supabase";

export function startNotificationListener(userId) {
  return supabase
    .channel("notification_queue")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notification_queue",
        filter: `user_id=eq.${userId}`,
      },
      async (payload) => {
        const row = payload.new;

        console.log("🔔 Queue event:", row);

        await supabase.functions.invoke("send-push", {
          body: {
            userId: row.user_id,
            title: row.title,
            body: row.body,
            url: row.url,
          },
        });

        // mark processed
        await supabase
          .from("notification_queue")
          .update({ processed: true })
          .eq("id", row.id);
      }
    )
    .subscribe();
}
