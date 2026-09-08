// deno-lint-ignore-file no-explicit-any
/**
 * export-user-data — LGPD Art. 18 (acesso/portabilidade).
 *
 * Exporta dados vinculados ao usuário autenticado nas superfícies atuais do
 * Readify. A exportação falha fechada se uma consulta esperada falhar: nunca
 * devolvemos um arquivo parcial rotulado como completo.
 */
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body, null, status === 200 ? 2 : 0), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

function required<T = any>(label: string, result: { data: T; error: any }): T {
  if (result.error) {
    console.error(`[export-user-data] ${label}`, result.error.code, result.error.message);
    throw new Error(`export_query_failed:${label}`);
  }
  return result.data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "missing_auth" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const sbAuth = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: userErr } = await sbAuth.auth.getUser();
    if (userErr || !user) return json({ error: "invalid_auth" }, 401);

    const sb = createClient(url, service);
    const uid = user.id;

    const results = await Promise.all([
      sb.from("profiles").select("*").eq("id", uid).maybeSingle(),
      sb.from("user_roles").select("*").eq("user_id", uid),
      sb.from("user_books").select("*").eq("user_id", uid),
      sb.from("user_book_notes").select("*").eq("user_id", uid),
      sb.from("reviews").select("*").eq("user_id", uid),
      sb.from("review_comments").select("*").eq("user_id", uid),
      sb.from("review_likes").select("*").eq("user_id", uid),
      sb.from("book_recommendations").select("*").eq("user_id", uid),
      sb.from("recommendation_comments").select("*").eq("user_id", uid),
      sb.from("recommendation_likes").select("*").eq("user_id", uid),
      sb.from("follows").select("*").or(`follower_id.eq.${uid},following_id.eq.${uid}`),
      sb.from("user_achievements").select("*").eq("user_id", uid),
      sb.from("reading_goals").select("*").eq("user_id", uid),
      sb.from("xp_events").select("*").eq("user_id", uid),
      sb.from("user_streaks").select("*").eq("user_id", uid),
      sb.from("user_challenges").select("*").eq("user_id", uid),
      sb.from("daily_surprise_claims").select("*").eq("user_id", uid),
      sb.from("user_interactions").select("*").eq("user_id", uid),
      sb.from("notifications").select("*").eq("user_id", uid),
      sb.from("push_subscriptions")
        .select("id,user_id,user_agent,created_at,updated_at")
        .eq("user_id", uid),
      sb.from("activities").select("*").or(`user_id.eq.${uid},target_user_id.eq.${uid}`),
      sb.from("activity_comments").select("*").eq("user_id", uid),
      sb.from("activity_likes").select("*").eq("user_id", uid),
      sb.from("loans").select("*").eq("user_id", uid),
      sb.from("trades").select("*").or(`proposer_id.eq.${uid},receiver_id.eq.${uid}`),
      sb.from("trade_matches").select("*").or(`offerer_id.eq.${uid},wisher_id.eq.${uid}`),
      sb.from("purchase_offers").select("*").or(`offerer_id.eq.${uid},receiver_id.eq.${uid}`),
      sb.from("invites").select("*").eq("user_id", uid),
      sb.from("invite_redemptions").select("*").or(`inviter_id.eq.${uid},invitee_id.eq.${uid}`),
      sb.from("book_clubs").select("*").eq("owner_id", uid),
      sb.from("club_members").select("*").eq("user_id", uid),
      sb.from("club_messages").select("*").eq("user_id", uid),
      sb.from("club_message_reactions").select("*").eq("user_id", uid),
      sb.from("club_book_nominations").select("*").eq("nominated_by", uid),
      sb.from("club_book_votes").select("*").eq("user_id", uid),
      sb.from("buddy_reads").select("*").or(`initiator_id.eq.${uid},invitee_id.eq.${uid}`),
      sb.from("buddy_read_participants").select("*").eq("user_id", uid),
      sb.from("buddy_read_messages").select("*").eq("user_id", uid),
      sb.from("stories").select("*").eq("user_id", uid),
      sb.from("story_views").select("*").eq("user_id", uid),
      sb.from("app_events").select("*").eq("user_id", uid),
      sb.from("admin_audit_log").select("*").eq("actor_id", uid),
      sb.from("automation_runs").select("*").eq("triggered_by", uid),
    ]);

    const [
      profile, roles, library, notes, reviews, reviewComments, reviewLikes,
      recommendations, recommendationComments, recommendationLikes, follows,
      achievements, goals, xpHistory, streaks, challenges, surpriseClaims,
      interactions, notifications, pushSubscriptions, activities, activityComments,
      activityLikes, loans, trades, tradeMatches, purchaseOffers, invites,
      inviteRedemptions, ownedClubs, clubMembers, clubMessages, clubReactions,
      clubNominations, clubVotes, buddyReads, buddyParticipants, buddyMessages,
      stories, storyViews, appEvents, auditEvents, automationRuns,
    ] = results;

    const payload = {
      format: "readify-user-export",
      version: 2,
      generated_at: new Date().toISOString(),
      user: {
        id: uid,
        email: user.email,
        phone: user.phone ?? null,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at ?? null,
      },
      profile: required("profile", profile),
      roles: required("user_roles", roles) ?? [],
      library: required("library", library) ?? [],
      notes: required("user_book_notes", notes) ?? [],
      reviews: required("reviews", reviews) ?? [],
      review_comments: required("review_comments", reviewComments) ?? [],
      review_likes: required("review_likes", reviewLikes) ?? [],
      recommendations: required("book_recommendations", recommendations) ?? [],
      recommendation_comments: required("recommendation_comments", recommendationComments) ?? [],
      recommendation_likes: required("recommendation_likes", recommendationLikes) ?? [],
      follows: required("follows", follows) ?? [],
      achievements: required("user_achievements", achievements) ?? [],
      reading_goals: required("reading_goals", goals) ?? [],
      xp_history: required("xp_events", xpHistory) ?? [],
      streaks: required("user_streaks", streaks) ?? [],
      challenges: required("user_challenges", challenges) ?? [],
      daily_surprise_claims: required("daily_surprise_claims", surpriseClaims) ?? [],
      interactions: required("user_interactions", interactions) ?? [],
      notifications: required("notifications", notifications) ?? [],
      // Cryptographic Web Push endpoint keys are deliberately not exported.
      push_subscriptions: required("push_subscriptions", pushSubscriptions) ?? [],
      activities: required("activities", activities) ?? [],
      activity_comments: required("activity_comments", activityComments) ?? [],
      activity_likes: required("activity_likes", activityLikes) ?? [],
      loans: required("loans", loans) ?? [],
      trades: required("trades", trades) ?? [],
      trade_matches: required("trade_matches", tradeMatches) ?? [],
      purchase_offers: required("purchase_offers", purchaseOffers) ?? [],
      invites: required("invites", invites) ?? [],
      invite_redemptions: required("invite_redemptions", inviteRedemptions) ?? [],
      owned_clubs: required("book_clubs", ownedClubs) ?? [],
      club_memberships: required("club_members", clubMembers) ?? [],
      club_messages: required("club_messages", clubMessages) ?? [],
      club_message_reactions: required("club_message_reactions", clubReactions) ?? [],
      club_book_nominations: required("club_book_nominations", clubNominations) ?? [],
      club_book_votes: required("club_book_votes", clubVotes) ?? [],
      buddy_reads: required("buddy_reads", buddyReads) ?? [],
      buddy_read_participation: required("buddy_read_participants", buddyParticipants) ?? [],
      buddy_read_messages: required("buddy_read_messages", buddyMessages) ?? [],
      stories: required("stories", stories) ?? [],
      story_views: required("story_views", storyViews) ?? [],
      app_events: required("app_events", appEvents) ?? [],
      admin_audit_events: required("admin_audit_log", auditEvents) ?? [],
      automation_runs: required("automation_runs", automationRuns) ?? [],
    };

    return json(payload, 200, {
      "Content-Disposition": `attachment; filename="readify-export-${uid}.json"`,
      "Cache-Control": "no-store",
    });
  } catch (e: any) {
    console.error("[export-user-data] fatal", e?.message || e);
    return json({ error: "export_incomplete" }, 500);
  }
});
