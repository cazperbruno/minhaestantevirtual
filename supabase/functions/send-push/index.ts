// Edge function: envia Web Push (VAPID) para todas as inscrições do destinatário.
// É acionada pelo trigger `notifications_push_trigger` após INSERT em `notifications`.
//
// Segurança: endpoint estritamente server-to-server. O caller informa apenas o
// notification_id; destinatário e conteúdo são carregados do banco para impedir
// spoofing/tampering de user_id, título, corpo ou link.
import webpush from "npm:web-push@3.6.7";
import { requireAdmin } from "../_shared/admin-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:noreply@readify.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await requireAdmin(req);
  if (!guard.ok || !guard.isService) {
    return new Response(JSON.stringify({ error: "service_only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const notificationId = typeof payload?.notification_id === "string"
      ? payload.notification_id.trim()
      : "";

    if (!notificationId) {
      return new Response(JSON.stringify({ error: "notification_id_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: notification, error: notificationError } = await guard.sb
      .from("notifications")
      .select("id,user_id,title,body,link")
      .eq("id", notificationId)
      .maybeSingle();

    if (notificationError) throw notificationError;
    if (!notification) {
      return new Response(JSON.stringify({ error: "notification_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error } = await guard.sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", notification.user_id);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pushPayload = JSON.stringify({
      title: notification.title,
      body: notification.body || "",
      link: notification.link || "/",
      notification_id: notification.id,
    });

    let sent = 0;
    const toDelete: string[] = [];

    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          pushPayload,
        );
        sent++;
      } catch (err: any) {
        // 404/410 = subscription expirada → remover
        if (err?.statusCode === 404 || err?.statusCode === 410) toDelete.push(s.id);
        else console.error("push error", err?.statusCode, err?.body);
      }
    }));

    if (toDelete.length > 0) {
      const { error: deleteError } = await guard.sb
        .from("push_subscriptions")
        .delete()
        .in("id", toDelete);
      if (deleteError) console.error("push subscription cleanup failed", deleteError.message);
    }

    return new Response(JSON.stringify({ sent, removed: toDelete.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push fatal:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
