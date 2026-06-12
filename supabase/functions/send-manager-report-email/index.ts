import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type RequestBody = {
  reportId?: string;
  title?: string;
  description?: string;
  projectName?: string | null;
  requestorName?: string | null;
  requestDatetime?: string | null;
  createdAt?: string | null;
};

function sanitize(value: unknown): string {
  return String(value ?? "")
    .replace(/[&<>"']/g, (char) => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return entities[char] || char;
    });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("EMAIL_FROM");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Email is optional — only sent when both keys are configured
    const emailEnabled = Boolean(resendApiKey && emailFrom);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") || "", {
      global: { headers: { Authorization: authHeader } }
    });

    const {
      data: { user },
      error: userError
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = (await req.json()) as RequestBody;

    if (!body.reportId) {
      return new Response(JSON.stringify({ error: "reportId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: managerProfiles, error: managerError } = await adminClient
      .from("user_profiles")
      .select("id, full_name")
      .eq("role", "manager");

    if (managerError) {
      return new Response(JSON.stringify({ error: managerError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const managers = managerProfiles || [];

    if (managers.length === 0) {
      return new Response(
        JSON.stringify({ success: true, pushSent: 0, emailSent: 0, message: "No manager recipients found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reportId = body.reportId!;
    const appUrl = Deno.env.get("APP_URL") || "";
    const detailsUrl = appUrl ? `${appUrl.replace(/\/$/, "")}/report/${reportId}` : "";
    const pushTitle = `New report: ${body.title || reportId}`;
    const pushBody = [body.projectName, body.requestorName].filter(Boolean).join(" · ") || "A new report needs your attention";

    // ---- 1. WEB PUSH via existing notification_queue → send-push pipeline ----
    let pushSent = 0;
    for (const manager of managers) {
      const { error: queueError } = await adminClient
        .from("notification_queue")
        .insert({
          user_id: manager.id,
          title: pushTitle,
          body: pushBody,
          url: detailsUrl || null,
          processed: false
        });

      if (queueError) {
        console.error("Failed to queue push for manager", manager.id, queueError);
      } else {
        pushSent++;
      }
    }

    // ---- 2. EMAIL via Resend (optional — only when keys are configured) ----
    let emailSent = 0;
    let emailError: string | null = null;

    if (emailEnabled) {
      const managerEmails: string[] = [];
      for (const manager of managers) {
        const { data: managerUser, error } = await adminClient.auth.admin.getUserById(manager.id);
        if (error || !managerUser?.user?.email) continue;
        managerEmails.push(managerUser.user.email);
      }

      if (managerEmails.length > 0) {
        const ticketTitle = sanitize(body.title || "(No title)");
        const ticketDescription = sanitize(body.description || "-");
        const projectName = sanitize(body.projectName || "-");
        const requestorName = sanitize(body.requestorName || "-");
        const requestDatetime = sanitize(body.requestDatetime || body.createdAt || "-");
        const safeReportId = sanitize(reportId);
        const subject = `New report submitted: ${body.title || reportId}`;

        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
            <h2 style="margin: 0 0 12px;">New Report Submitted</h2>
            <p style="margin: 0 0 12px;">A user has submitted a new report and is awaiting manager review.</p>
            <table style="border-collapse: collapse; width: 100%; margin-bottom: 12px;">
              <tr><td style="padding: 6px 0; font-weight: 600; width: 160px;">Report ID</td><td style="padding: 6px 0;">${safeReportId}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 600;">Title</td><td style="padding: 6px 0;">${ticketTitle}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 600;">Project</td><td style="padding: 6px 0;">${projectName}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 600;">Requestor</td><td style="padding: 6px 0;">${requestorName}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 600;">Requested At</td><td style="padding: 6px 0;">${requestDatetime}</td></tr>
              <tr><td style="padding: 6px 0; font-weight: 600; vertical-align: top;">Description</td><td style="padding: 6px 0;">${ticketDescription}</td></tr>
            </table>
            ${detailsUrl ? `<p style="margin: 8px 0 0;"><a href="${detailsUrl}" style="color: #2563eb;">Open report in app</a></p>` : ""}
          </div>
        `;

        const text = [
          "New Report Submitted",
          "",
          `Report ID: ${reportId}`,
          `Title: ${body.title || "(No title)"}`,
          `Project: ${body.projectName || "-"}`,
          `Requestor: ${body.requestorName || "-"}`,
          `Requested At: ${body.requestDatetime || body.createdAt || "-"}`,
          `Description: ${body.description || "-"}`,
          detailsUrl ? `Details: ${detailsUrl}` : ""
        ].filter(Boolean).join("\n");

        const [to, ...bcc] = managerEmails;
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: emailFrom, to, ...(bcc.length ? { bcc } : {}), subject, html, text })
        });

        if (resendResponse.ok) {
          emailSent = managerEmails.length;
        } else {
          emailError = await resendResponse.text();
          console.error("Resend error:", emailError);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, pushSent, emailSent, ...(emailError ? { emailError } : {}) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
