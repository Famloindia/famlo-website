// app/admin/page.tsx
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  createAdminSessionToken, getAdminCookieName, getAdminSessionMaxAge,
  verifyAdminPassword, verifyAdminSessionToken
} from "@/lib/admin-auth";
import { detectChatSafetyIssue } from "@/lib/chat-safety";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logSessionEvent } from "@/lib/audit";
import AdminAdsAndBanners from "@/components/admin/AdminAdsAndBanners"
import AdminCoupons from "@/components/admin/AdminCoupons";

// Admin layout and feature components
import AdminLayout from "@/components/admin/AdminLayout";
import MasterEntityTable from "@/components/admin/MasterEntityTable";
import CommissionSlider from "@/components/admin/CommissionSlider";
import ChatMonitor from "@/components/admin/ChatMonitor";
import DisputeCenter from "@/components/admin/DisputeCenter";
import KillSwitch from "@/components/admin/KillSwitch";
import BulkMailbox from "@/components/admin/BulkMailbox";
import ChannelManagerConsole from "@/components/admin/ChannelManagerConsole";
import CompliancePacksDashboard from "@/components/admin/CompliancePacksDashboard";
import GrowthDashboard from "@/components/admin/GrowthDashboard";
import GrievanceDashboard from "@/components/admin/GrievanceDashboard";
import GSTExport from "@/components/admin/GSTExport";
import FraudFlags from "@/components/admin/FraudFlags";
import AccountSuspend from "@/components/admin/AccountSuspend";
import DataErasure from "@/components/admin/DataErasure";
import ResponseTimeTracker from "@/components/admin/ResponseTimeTracker";
import RevenueHeatmap from "@/components/admin/RevenueHeatmap";
import ShadowMode from "@/components/admin/ShadowMode";
import SupportManager from "@/components/admin/SupportManager";
import PlatformOpsDashboard from "@/components/admin/PlatformOpsDashboard";
import TestimonialsDesk from "@/components/admin/TestimonialsDesk";
import ManualPayoutDesk from "@/components/admin/ManualPayoutDesk";
import AuditTrail from "@/components/teams/AuditTrail";
import CancellationTrail from "@/components/teams/CancellationTrail";
import IDVerifier from "@/components/teams/IDVerifier";
import VettingScorecard from "@/components/teams/VettingScorecard";
import TeamManagementPanel from "@/components/admin/TeamManagementPanel";
import { fetchCancellationHistory } from "@/lib/cancellation-history";

export const dynamic = "force-dynamic";

interface AdminPageProps {
  searchParams?: Promise<{ error?: string; tab?: string }>;
}

const ADMIN_ID = "system-admin";

function stableNumber(seed: string, max: number, offset = 0): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }

  return (hash % max) + offset;
}

// Login form component (inline server action)
function LoginPage({ error }: { error?: boolean }) {
  async function login(formData: FormData) {
    "use server";
    const password = String(formData.get("password") ?? "");
    const cookieStore = await cookies();
    if (!verifyAdminPassword(password)) redirect("/admin?error=invalid-password");
    cookieStore.set(getAdminCookieName(), createAdminSessionToken(), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: getAdminSessionMaxAge()
    });
    revalidatePath("/admin");
    redirect("/admin");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f7f9fc", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "24px", padding: "48px", maxWidth: "420px", width: "100%", margin: "20px", boxShadow: "0 10px 40px -10px rgba(0,0,0,0.06)" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#0f172a", margin: "0 0 8px" }}>Admin Access</h1>
        <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 32px", lineHeight: 1.6 }}>
          This portal is not indexed by search engines. Unauthorized access is logged.
        </p>
        <form action={login}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
            Admin Password
          </label>
          <input name="password" type="password" required className="admin-login-input"
            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1px solid #dbeafe", background: "#ffffff", color: "#0f172a", fontSize: "14px", outline: "none", fontFamily: "inherit", marginBottom: "8px", boxSizing: "border-box", transition: "border-color 0.2s" }} 
            />
          {error && <div style={{ fontSize: "12px", color: "#ef4444", fontWeight: 700, marginBottom: "12px" }}>Invalid admin password.</div>}
          <button type="submit" style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: "linear-gradient(135deg, #1A56DB, #3B82F6)", color: "white", fontWeight: 900, fontSize: "15px", cursor: "pointer", marginTop: "8px", boxShadow: "0 4px 14px rgba(26,86,219,0.42)" }}>
            Enter Admin Portal
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function AdminPage({ searchParams }: Readonly<AdminPageProps>) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const isAuthenticated = verifyAdminSessionToken(cookieStore.get(getAdminCookieName())?.value);

  if (!isAuthenticated) {
    return <LoginPage error={params?.error === "invalid-password"} />;
  }

  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const activeTab = params?.tab ?? "entities";
  const supabase = createAdminSupabaseClient();

  await logSessionEvent({
    actorId: ADMIN_ID,
    role: "admin",
    action: "page_view",
    page: `/admin?tab=${activeTab}`,
    ipAddress: ip,
    userAgent: reqHeaders.get("user-agent") ?? undefined,
  });

  const { data: killSwitchData } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "kill_switch_active")
    .single();
  const killSwitchActive = killSwitchData?.value === "true";

  let content: React.ReactNode;

  if (activeTab === "entities") {
    const { data: familyListings } = await supabase
      .from("families")
      .select("id, name, city, village, rating, total_stays, is_active, created_at, upi_id, price_fullday, user_id")
      .limit(100);

    const { data: guideListings } = await supabase
      .from("hommie_profiles_v2")
      .select("id, display_name, city, status, created_at, user_id, hourly_price")
      .limit(100);

    // Fetch corresponding user emails for all entities
    const userIds = [
      ...(familyListings ?? []).map(f => f.user_id),
      ...(guideListings ?? []).map(g => g.user_id)
    ].filter(Boolean);
    
    const { data: userData } = await supabase
      .from("users")
      .select("id, email")
      .in("id", userIds);
      
    const emailMap = Object.fromEntries((userData ?? []).map(u => [u.id, u.email]));

    const entities = [
      ...(familyListings ?? []).map(f => ({
        id: f.id, 
        name: f.name || "UNNAMED FAMILY", 
        type: "host" as const,
        status: f.is_active ? ("active" as const) : ("inactive" as const),
        city: f.village || f.city || "Unknown",
        revenue: (f.total_stays ?? 0) * (f.price_fullday ?? 800), 
        rating: f.rating ?? 0, 
        joined: f.created_at, 
        email: emailMap[f.user_id] ?? ""
      })),
      ...(guideListings ?? []).map((g: any) => ({
        id: g.id, 
        name: g.display_name || "UNNAMED HOMMIE", 
        type: "hommie" as const, 
        status: g.status === "published" ? ("active" as const) : ("inactive" as const),
        city: g.city || "Unknown",
        revenue: 0,
        rating: 0,
        joined: g.created_at,
        email: emailMap[g.user_id] ?? ""
      }))
    ];
    content = <MasterEntityTable entities={entities as any} />;

  } else if (activeTab === "vetting") {
    const { data: familyApps } = await supabase
      .from("family_applications")
      .select("id, full_name, email, about_family, status, photo_url, onboarding_draft_id, property_name, property_address, village, state")
      .eq("status", "pending");

    const { data: friendApps } = await supabase
      .from("friend_applications")
      .select("id, full_name, email, bio, status, photo_url")
      .eq("status", "pending");

    // Fetch full draft details for home apps
    const draftIds = (familyApps ?? []).map(a => a.onboarding_draft_id).filter(Boolean);
    const { data: drafts } = draftIds.length > 0 
      ? await supabase.from("host_onboarding_drafts").select("*").in("id", draftIds)
      : { data: [] };

    const apps = [
      ...(familyApps ?? []).map((a) => {
        const familyApp = a as typeof a & {
          host_photo_url?: string | null;
        };
        const draft = (drafts ?? []).find(d => d.id === a.onboarding_draft_id);
        const payload = (draft?.payload as any) || {};
        const preferredPhoto =
          draft?.host_photo_url ||
          payload.hostPhoto ||
          familyApp.host_photo_url ||
          familyApp.photo_url ||
          null;
        return { 
          application_type: "family",
          ...a,
          photo_url: preferredPhoto,
          bio: a.about_family || draft?.host_bio || payload.hostBio,
          address: `${a.property_name || 'Home'} - ${a.property_address || a.village || ''}, ${a.state || ''}`,
          draft_data: draft 
        };
      }),
      ...(friendApps ?? []).map((a: any) => ({
        application_type: "friend",
        ...a,
        address: "Friend Guide"
      }))
    ];
    content = <VettingScorecard applications={apps as any} actorId={ADMIN_ID} actorRole="admin" />;


  } else if (activeTab === "ads") {
  const { data: adsV2Data } = await supabase.from("ads_v2").select("*").order("priority");
  const { data: bannersData } = await supabase.from("hero_banners").select("*").order("sort_order");
  content = <AdminAdsAndBanners ads={adsV2Data ?? []} banners={bannersData ?? []} adminId={ADMIN_ID} />;

  } else if (activeTab === "channel-manager") {
    content = <ChannelManagerConsole />;

  } else if (activeTab === "ops-dashboard") {
    content = <PlatformOpsDashboard />;

  } else if (activeTab === "growth") {
    content = <GrowthDashboard />;

  } else if (activeTab === "testimonials") {
    content = <TestimonialsDesk />;

  } else if (activeTab === "compliance-packs") {
    content = <CompliancePacksDashboard />;

  } else if (activeTab === "coupons") {
    const { data: couponsData } = await supabase.from("coupons_v2").select("*").order("created_at", { ascending: false });
    content = <AdminCoupons coupons={couponsData ?? []} adminId={ADMIN_ID} />;

  } else if (activeTab === "commission") {
    const { data: users } = await supabase.from("users").select("id, name, email, role, commission_rate_override").in("role", ["host", "hommie"]).order("name");
    const { data: activeDefaultRule } = await supabase
      .from("commission_rules")
      .select("rate_bps, rule_set_id")
      .eq("scope", "global_default")
      .eq("product_type", "host_stay")
      .eq("is_preview", false)
      .order("priority", { ascending: true })
      .limit(1)
      .maybeSingle();

    const platformDefaultRate = Number(activeDefaultRule?.rate_bps ?? 1800) / 100;
    content = <CommissionSlider entities={(users ?? []) as any} platformDefaultRate={platformDefaultRate} adminId={ADMIN_ID} />;

  } else if (activeTab === "chat") {
    const { data: keywords } = await supabase.from("chat_keywords").select("keyword");
    const keywordList = (keywords ?? []).map((row) => row.keyword);
    const { data: flagRows } = await supabase
      .from("chat_flags")
      .select("conversation_id,status,reviewed_at")
      .eq("status", "pending")
      .limit(50);

    const flaggedConversationIds = [...new Set((flagRows ?? []).map((row) => row.conversation_id).filter(Boolean))];

    const { data: conversations } = flaggedConversationIds.length > 0
      ? await supabase
          .from("conversations")
          .select("id, guest_id, host_id, family_id, last_message, guest_unread, host_unread")
          .in("id", flaggedConversationIds)
      : { data: [] };

    const { data: messages } = flaggedConversationIds.length > 0
      ? await supabase
          .from("messages")
          .select("id, conversation_id, sender_id, sender_type, text, created_at")
          .in("conversation_id", flaggedConversationIds)
          .order("created_at", { ascending: true })
      : { data: [] };

    const guestIds = [...new Set((conversations ?? []).map((row) => row.guest_id).filter(Boolean))];
    const hostIds = [...new Set((conversations ?? []).map((row) => row.host_id).filter(Boolean))];
    const familyIds = [...new Set((conversations ?? []).map((row) => row.family_id).filter(Boolean))];

    const [guestResult, hostResult, familyResult] = await Promise.all([
      guestIds.length > 0 ? supabase.from("users").select("id,name").in("id", guestIds) : Promise.resolve({ data: [], error: null }),
      hostIds.length > 0 ? supabase.from("users").select("id,name").in("id", hostIds) : Promise.resolve({ data: [], error: null }),
      familyIds.length > 0 ? supabase.from("families").select("id,name,host_id").in("id", familyIds) : Promise.resolve({ data: [], error: null }),
    ]);

    const guestMap = Object.fromEntries((guestResult.data ?? []).map((row) => [row.id, row]));
    const hostMap = Object.fromEntries((hostResult.data ?? []).map((row) => [row.id, row]));
    const familyMap = Object.fromEntries((familyResult.data ?? []).map((row) => [row.id, row]));
    const flagMap = new Map((flagRows ?? []).map((row) => [row.conversation_id, row]));
    const messageMap = new Map<string, any[]>();

    for (const message of messages ?? []) {
      const bucket = messageMap.get(message.conversation_id) ?? [];
      bucket.push(message);
      messageMap.set(message.conversation_id, bucket);
    }

    const monitorConversations = (conversations ?? []).map((conversation: any) => {
      const family = conversation.family_id ? familyMap[conversation.family_id] : null;
      const guest = conversation.guest_id ? guestMap[conversation.guest_id] : null;
      const host = conversation.host_id ? hostMap[conversation.host_id] : null;
      const flag = flagMap.get(conversation.id);
      const threadMessages = (messageMap.get(conversation.id) ?? []).map((message) => {
        const messageText = message.text || "";
        const safety = detectChatSafetyIssue(messageText, keywordList);
        return {
          id: message.id,
          sender_name:
            message.sender_type === "guest"
              ? guest?.name ?? "Guest"
              : host?.name ?? family?.name ?? "Host",
          sender_type: message.sender_type,
          content: messageText,
          created_at: message.created_at,
          flagged: safety.matched,
          trigger_keyword: safety.trigger ?? undefined,
        };
      });

      return {
        id: conversation.id,
        guest_name: guest?.name ?? "Guest",
        host_name: host?.name ?? family?.name ?? "Host",
        type: "guest-host" as const,
        last_message: conversation.last_message ?? "Conversation started",
        messages: threadMessages,
        is_flagged: Boolean(flag),
        flag_status: (flag?.status ?? null) as "pending" | "reviewed" | "dismissed" | null,
      };
    });

    content = <ChatMonitor keywords={keywordList} conversations={monitorConversations} adminId={ADMIN_ID} />;

  } else if (activeTab === "disputes") {
    const { data: disputes } = await supabase.from("disputes").select("*, bookings(*, users(name))").order("created_at", { ascending: false });
    const mapped = (disputes ?? []).map((d: any) => ({
      id: d.id, booking_id: d.booking_id, raised_by_name: d.bookings?.users?.name ?? "Unknown", raised_by_type: "guest" as const, status: d.status,
      amount: d.bookings?.total_price ?? 0, payout_frozen: d.payout_frozen, description: d.description, created_at: d.created_at,
      acknowledged_at: d.acknowledged_at, resolved_at: d.resolved_at
    }));
    content = <DisputeCenter disputes={mapped as any} adminId={ADMIN_ID} />;

  } else if (activeTab === "killswitch") {
    content = <KillSwitch isActive={killSwitchActive} adminId={ADMIN_ID} />;

  } else if (activeTab === "mailbox") {
    const { count: hostCount } = await supabase.from("users").select("*", { count: 'exact', head: true }).eq("role", "host");
    const { count: hommieCount } = await supabase.from("users").select("*", { count: 'exact', head: true }).eq("role", "hommie");
    content = <BulkMailbox hostCount={hostCount ?? 0} hommieCount={hommieCount ?? 0} adminId={ADMIN_ID} />;

  } else if (activeTab === "grievances") {
    const { data: grievances } = await supabase.from("grievances").select("*, users(name, email)").order("created_at", { ascending: false });
    const mapped = (grievances ?? []).map((g: any) => ({
      id: g.id, user_id: g.user_id, user_name: g.users?.name ?? "Unknown", user_email: g.users?.email ?? "", complaint_type: g.complaint_type,
      description: g.description, status: g.status, assigned_to: g.assigned_to, acknowledged_at: g.acknowledged_at, sla_deadline: g.sla_deadline, resolved_at: g.resolved_at, created_at: g.created_at
    }));
    content = <GrievanceDashboard grievances={mapped as any} adminId={ADMIN_ID} />;

  } else if (activeTab === "fraud") {
    const { data: flags } = await supabase.from("fraud_flags").select("*, user_a:users!fraud_flags_user_id_a_fkey(name, email), user_b:users!fraud_flags_user_id_b_fkey(name, email)").order("created_at", { ascending: false });
    const mapped = (flags ?? []).map((f: any) => ({
      id: f.id, user_id_a: f.user_id_a, user_id_b: f.user_id_b, user_name_a: f.user_a?.name ?? "Unknown", user_name_b: f.user_b?.name ?? "Unknown",
      email_a: f.user_a?.email ?? "", email_b: f.user_b?.email ?? "", flag_reason: f.flag_reason, status: f.status, created_at: f.created_at,
    }));
    content = <FraudFlags flags={mapped} adminId={ADMIN_ID} />;

  } else if (activeTab === "audit") {
    const [entriesRes, cancellationEntries] = await Promise.all([
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200),
      fetchCancellationHistory(supabase, { limit: 100 }),
    ]);

    content = (
      <div style={{ display: "grid", gap: "24px" }}>
        <CancellationTrail entries={cancellationEntries as any} />
        <AuditTrail entries={(entriesRes.data ?? []) as any} />
      </div>
    );

  } else if (activeTab === "heatmap") {
    const { data: bookingsV2 } = await supabase
      .from("bookings_v2")
      .select("host_id,total_price,hosts(lat,lng)")
      .not("hosts.lat", "is", null);
    const points = ((bookingsV2 ?? []) as any[]).map((b: any) => ({
      id: b.host_id,
      lat: b.hosts?.lat ?? 26.2389,
      lng: b.hosts?.lng ?? 73.0243,
      intensity: 0.8,
      type: "booking" as const
    }));
    content = <RevenueHeatmap points={points} />;

  } else if (activeTab === "shadow") {
    const { data: users } = await supabase.from("users").select("id, name, email, role").in("role", ["host", "hommie"]).limit(100);
    content = <ShadowMode users={(users ?? []) as any} actorId={ADMIN_ID} />;

  } else if (activeTab === "payouts") {
    const { data: payoutRows } = await supabase
      .from("payouts_v2")
      .select("id,booking_id,partner_type,partner_user_id,status,amount,net_transferable_amount,gross_booking_value,platform_fee,platform_fee_tax,hold_reason,notes,method,created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    const bookingIds = [...new Set((payoutRows ?? []).map((row) => row.booking_id).filter(Boolean))];
    const partnerUserIds = [...new Set((payoutRows ?? []).map((row) => row.partner_user_id).filter(Boolean))];

    const [bookingsResult, usersResult] = await Promise.all([
      bookingIds.length > 0
        ? supabase
            .from("bookings_v2")
            .select("id,status,payment_status,guest_name,host_name,hommie_name,host_id,hommie_id")
            .in("id", bookingIds)
        : Promise.resolve({ data: [], error: null }),
      partnerUserIds.length > 0
        ? supabase.from("users").select("id,name,email").in("id", partnerUserIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const hostIds = [...new Set((bookingsResult.data ?? []).map((row: any) => row.host_id).filter(Boolean))];
    const hommieIds = [...new Set((bookingsResult.data ?? []).map((row: any) => row.hommie_id).filter(Boolean))];

    const [familiesResult, hommiesResult] = await Promise.all([
      hostIds.length > 0
        ? supabase.from("families").select("id,upi_id,bank_account_number,ifsc_code,bank_name").in("id", hostIds)
        : Promise.resolve({ data: [], error: null }),
      hommieIds.length > 0
        ? supabase.from("hommie_profiles_v2").select("id").in("id", hommieIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const bookingMap = new Map((bookingsResult.data ?? []).map((row: any) => [row.id, row]));
    const userMap = new Map((usersResult.data ?? []).map((row: any) => [row.id, row]));
    const familyMap = new Map((familiesResult.data ?? []).map((row: any) => [row.id, row]));
    const hommieMap = new Map((hommiesResult.data ?? []).map((row: any) => [row.id, row]));

    const payoutDeskRows = (payoutRows ?? []).map((row: any) => {
      const booking = bookingMap.get(row.booking_id) ?? {};
      const user = userMap.get(row.partner_user_id) ?? {};
      const family = booking.host_id ? familyMap.get(booking.host_id) ?? {} : {};
      const hommie = booking.hommie_id ? hommieMap.get(booking.hommie_id) ?? {} : {};

      const payoutDestination =
        row.partner_type === "host"
          ? family?.upi_id || family?.bank_account_number || null
          : null;

      return {
        payoutId: row.id,
        bookingId: row.booking_id,
        partnerType: row.partner_type,
        partnerName: booking.host_name || booking.hommie_name || user.name || "Partner",
        partnerEmail: user.email || "",
        payoutStatus: row.status || "scheduled",
        bookingStatus: booking.status || "unknown",
        amount: Number(row.amount || 0),
        netTransferableAmount: Number(row.net_transferable_amount || row.amount || 0),
        grossBookingValue: Number(row.gross_booking_value || 0),
        platformFee: Number(row.platform_fee || 0),
        platformFeeTax: Number(row.platform_fee_tax || 0),
        guestName: booking.guest_name || "Guest",
        paymentStatus: booking.payment_status || "unknown",
        createdAt: row.created_at || null,
        holdReason: row.hold_reason || null,
        payoutMethod: row.method || "manual",
        payoutDestination,
        notes: row.notes || null,
      };
    });

    content = <ManualPayoutDesk rows={payoutDeskRows as any} />;

  } else if (activeTab === "support") {
    content = <SupportManager actorId={ADMIN_ID} initialFilter="open" />;
  } else if (activeTab === "user-problems") {
    content = <SupportManager actorId={ADMIN_ID} initialFilter="user-problems" />;

  } else if (activeTab === "teams-mgmt") {
    const { data: team } = await supabase
      .from("users")
      .select("id, name, email, role, created_at")
      .eq("role", "team")
      .order("created_at", { ascending: false });

    content = <TeamManagementPanel teamMembers={(team ?? []) as any} />;

  } else if (activeTab === "gst") {
    content = <GSTExport adminId={ADMIN_ID} />;

  } else if (activeTab === "suspend") {
    const { data: users } = await supabase.from("users").select("id, name, email, role, kyc_status").in("role", ["host", "hommie"]).order("name");
    content = <AccountSuspend users={(users ?? []) as any} adminId={ADMIN_ID} />;

  } else if (activeTab === "erasure") {
    const { data: users } = await supabase.from("users").select("id, name, email, role, created_at").neq("kyc_status", "erased").order("name");
    content = <DataErasure users={(users ?? []) as any} adminId={ADMIN_ID} />;

  } else if (activeTab === "response") {
    const { data: hommies } = await supabase.from("hommie_profiles_v2").select("id, display_name, email").limit(50);
    const stats = ((hommies ?? []) as any[]).map((h) => ({
      id: h.id, name: h.display_name || "Unknown", email: h.email || "",
      avg_response_minutes: stableNumber(`${h.id}-avg`, 150, 1),
      total_conversations: stableNumber(`${h.id}-conversations`, 20, 1),
      flagged: false
    }));
    content = <ResponseTimeTracker stats={stats} />;

  } else if (activeTab === "id-verifier") {
    const { data: guestRecords } = await supabase
      .from("users")
      .select("id, name, email, city, state, gender, about, date_of_birth, avatar_url, verification_url, verification_type, id_document_url, id_document_type, kyc_status")
      .eq("role", "guest")
      .in("kyc_status", ["pending_review", "needs_resubmission", "profile_saved"]);

    const mapped = (guestRecords ?? [])
      .map((r) => ({
        id: r.id,
        full_name: r.name ?? "Guest",
        email: r.email ?? "",
        city: (r as any).city ?? null,
        state: (r as any).state ?? null,
        gender: (r as any).gender ?? null,
        about: (r as any).about ?? null,
        date_of_birth: (r as any).date_of_birth ?? null,
        kyc_status: r.kyc_status ?? null,
        profile_photo_url: r.avatar_url ?? null,
        id_document_url: r.id_document_url ?? r.verification_url ?? null,
        id_document_type: r.id_document_type ?? r.verification_type ?? "aadhaar_face_match",
        application_type: "guest" as const,
      }))
      .filter((r) => Boolean(r.profile_photo_url || r.id_document_url));

    content = <IDVerifier records={mapped} actorId={ADMIN_ID} />;

  } else {
    content = (
      <div style={{ textAlign: "center", padding: "80px", color: "rgba(255,255,255,0.2)" }}>
        <div style={{ fontSize: "40px", marginBottom: "16px" }}>⚡</div>
        <div style={{ fontSize: "18px", fontWeight: 900, color: "rgba(255,255,255,0.4)" }}>Select a feature from the sidebar</div>
      </div>
    );
  }

  return (
    <AdminLayout admin={{ id: ADMIN_ID, name: "Famlo Admin", email: "admin@famlo.in" }} activeTab={activeTab} killSwitchActive={killSwitchActive}>
      {content}
    </AdminLayout>
  );
}
