// app/teams/page.tsx
import { redirect } from "next/navigation";
import { verifyTeamSession, maskForTeam } from "@/lib/team-auth";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { logSessionEvent } from "@/lib/audit";
import { headers } from "next/headers";
import TeamsLayout from "@/components/teams/TeamsLayout";
import VettingScorecard from "@/components/teams/VettingScorecard";
import IDVerifier from "@/components/teams/IDVerifier";
import StalledOnboardings from "@/components/teams/StalledOnboardings";
import DocumentExpiryTracker from "@/components/teams/DocumentExpiryTracker";
import ShadowSupport from "@/components/teams/ShadowSupport";
import AuditTrail from "@/components/teams/AuditTrail";
import CancellationTrail from "@/components/teams/CancellationTrail";
import SupportManager from "@/components/admin/SupportManager";
import PromotionsBoard from "@/components/teams/PromotionsBoard";
import RefundsReviewDashboard from "@/components/admin/RefundsReviewDashboard";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getSupabaseAccessTokenCookieName } from "@/lib/auth-constants";
import { fetchCancellationHistory } from "@/lib/cancellation-history";

export const dynamic = "force-dynamic";

interface TeamsPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// SEO blackout — also enforced via middleware X-Robots-Tag header
export const metadata = {
  robots: { index: false, follow: false }
};

// Login form component for team portal (inline server action)
function LoginPage({ errorCode }: { errorCode?: string }) {
  async function login(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const cookieStore = await cookies();

    if (!email || !password) {
      redirect("/teams?error=invalid-credentials");
    }

    const supabase = createAdminSupabaseClient();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user || !data.session) {
      redirect("/teams?error=invalid-credentials");
    }

    const metadataRole = String(data.user.user_metadata?.role ?? data.user.app_metadata?.role ?? "").toLowerCase();
    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("role, name")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      redirect("/teams?error=login-failed");
    }

    const databaseRole = String((profile as { role?: unknown } | null)?.role ?? "").toLowerCase();
    const isTeamMember = metadataRole === "team" || databaseRole === "team";

    if (!isTeamMember) {
      redirect("/teams?error=unauthorized-role");
    }

    const maxAge = data.session.expires_at
      ? Math.max(60, data.session.expires_at - Math.floor(Date.now() / 1000))
      : 60 * 60 * 8;

    cookieStore.set(getSupabaseAccessTokenCookieName(), data.session.access_token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge,
    });
    revalidatePath("/teams");
    redirect("/teams");
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "24px", padding: "48px", maxWidth: "420px", width: "100%", margin: "20px", boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)" }}>
        <div style={{ width: "48px", height: "48px", background: "#165dcc", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "24px" }}>
          <span style={{ fontSize: "22px" }}>🛡️</span>
        </div>
        <div style={{ fontSize: "10px", fontWeight: 900, color: "#165dcc", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Famlo — Teams Portal</div>
        <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#0e2b57", margin: "0 0 8px" }}>Team Access</h1>
        <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 32px", lineHeight: 1.6 }}>
          Each team member gets a personal email and password. The admin password is no longer shared here.
        </p>
        <form action={login}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
            Team Email / ID
          </label>
          <input name="email" type="email" required
            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#0e2b57", fontSize: "14px", outline: "none", fontFamily: "inherit", marginBottom: "12px", boxSizing: "border-box" }} />
          <label style={{ display: "block", fontSize: "11px", fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
            Password
          </label>
          <input name="password" type="password" required
            style={{ width: "100%", padding: "12px 16px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc", color: "#0e2b57", fontSize: "14px", outline: "none", fontFamily: "inherit", marginBottom: "8px", boxSizing: "border-box" }} />
          {errorCode ? (
            <div style={{ fontSize: "12px", color: "#ef4444", fontWeight: 700, marginBottom: "12px" }}>
              {errorCode === "unauthorized-role"
                ? "This account is not assigned to the team portal."
                : "Invalid team credentials."}
            </div>
          ) : null}
          <button type="submit" style={{ width: "100%", padding: "14px", borderRadius: "12px", border: "none", background: "#165cc2", color: "white", fontWeight: 900, fontSize: "15px", cursor: "pointer", marginTop: "8px" }}>
            Verify & Enter
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  const member = await verifyTeamSession();
  const params = await searchParams;
  const errorCode = Array.isArray(params?.error) ? params.error[0] : params?.error;

  if (!member) {
    return <LoginPage errorCode={errorCode} />;
  }

  const activeTab = (Array.isArray(params?.tab) ? params.tab[0] : params?.tab) ?? "vetting";
  const supabase = createAdminSupabaseClient();
  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  // Log page visit for compliance session audit
  await logSessionEvent({
    actorId: member.id,
    role: member.role,
    action: "page_view",
    page: `/teams?tab=${activeTab}`,
    ipAddress: ip,
    userAgent: reqHeaders.get("user-agent") ?? undefined,
  });

  let content: React.ReactNode;

  if (activeTab === "vetting") {
    // VETTING: Pull from live application review queues
    const { data: familyApps } = await supabase
      .from("family_applications")
      .select("id, full_name, email, about_family, status, photo_url, property_address, village, state, whatsapp_number, property_name, onboarding_draft_id")
      .eq("status", "pending")
      .order("submitted_at", { ascending: true });

    // Fetch full draft details for all pending home applications
    const draftIds = (familyApps ?? []).map(a => a.onboarding_draft_id).filter(Boolean);
    const { data: drafts } = draftIds.length > 0 
      ? await supabase.from("host_onboarding_drafts").select("*").in("id", draftIds)
      : { data: [] };

    const { data: friendApps } = await supabase
      .from("friend_applications")
      .select("id, full_name, email, bio, status, photo_url, city, state, languages, interests")
      .eq("status", "pending")
      .order("submitted_at", { ascending: true });

    const apps = [
      ...(familyApps ?? []).map((a) => {
        const draft = (drafts ?? []).find(d => d.id === a.onboarding_draft_id);
        const payload = (draft?.payload as any) || {};
        return { 
          application_type: "family",
          ...a, 
          bio: a.about_family || draft?.host_bio || payload.hostBio,
          address: `${a.property_name || 'Home'} - ${a.property_address || a.village || ''}, ${a.state || ''}`,
          draft_data: draft 
        };
      }),
      ...(friendApps ?? []).map((a: any) => ({
        application_type: "friend",
        ...a,
        address: `${a.city || ''}, ${a.state || ''}`
      }))
    ].map((a: any) => maskForTeam(a, member.role));

    content = <VettingScorecard applications={apps as any} actorId={member.id} actorRole={member.role} />;

  } else if (activeTab === "support") {
    content = <SupportManager actorId={member.id} initialFilter="open" />;
  } else if (activeTab === "user-problems") {
    content = <SupportManager actorId={member.id} initialFilter="user-problems" />;


  } else if (activeTab === "id-verifier") {
    // ID VERIFIER: Side-by-side comparison of profile photo vs government ID
    const { data: records } = await supabase
      .from("family_applications")
      .select("id, full_name, email, photo_url, verification_url, verification_type")
      .eq("status", "pending")
      .not("verification_url", "is", null);

    const { data: guestRecords } = await supabase
      .from("users")
      .select("id, name, email, city, state, gender, about, date_of_birth, avatar_url, verification_url, verification_type, id_document_url, id_document_type, kyc_status")
      .eq("role", "guest")
      .eq("kyc_status", "pending_review");

    const mapped = [
      ...(records ?? []).map((r) => ({
      id: r.id,
      full_name: r.full_name,
      email: r.email,
      city: null,
      state: null,
      gender: null,
      about: null,
      date_of_birth: null,
      kyc_status: "pending",
      profile_photo_url: r.photo_url ?? null,
      id_document_url: r.verification_url ?? null,
      id_document_type: r.verification_type ?? "aadhar",
      application_type: "home" as const,
      })),
      ...(guestRecords ?? []).map((r) => ({
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
      })).filter((r) => Boolean(r.id_document_url)),
    ];

    content = <IDVerifier records={mapped} actorId={member.id} />;

  } else if (activeTab === "stalled") {
    // STALLED: Identify users stuck in the onboarding funnel for >3 days
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: stalled } = await supabase
      .from("host_onboarding_drafts")
      .select("id, mobile_number, current_step, updated_at, payload")
      .eq("listing_status", "draft")
      .lt("updated_at", threeDaysAgo)
      .order("updated_at", { ascending: true })
      .limit(50);

    const users = (stalled ?? []).map((d) => {
      const payload = d.payload as any;
      return {
        id: d.id,
        full_name: (d as any).primary_host_name || payload?.fullName || payload?.primaryHostName || "Unknown",
        email: payload?.email || "",
        phone: d.mobile_number,
        type: "home" as const,
        stuck_at_step: d.current_step ?? 1,
        days_stalled: Math.floor((now.getTime() - new Date(d.updated_at).getTime()) / 86400000),
        last_activity: new Date(d.updated_at).toLocaleDateString("en-IN"),
      };
    });

    content = <StalledOnboardings users={users} actorId={member.id} />;

  } else if (activeTab === "documents") {
    // DOCUMENTS: Track nearing-expiry compliance certificates
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];

    const { data: docs } = await supabase
      .from("documents")
      .select("id, user_id, doc_type, expiry_date, status, users(name, email, role)")
      .gte("expiry_date", today)
      .lte("expiry_date", in30Days)
      .order("expiry_date", { ascending: true });

    const mapped = (docs ?? []).map((d: any) => ({
      id: d.id,
      user_id: d.user_id,
      user_name: d.users?.name ?? "Unknown",
      user_email: d.users?.email ?? "",
      user_type: (d.users?.role === "host" ? "host" : "hommie") as "host" | "hommie",
      doc_type: d.doc_type,
      expiry_date: d.expiry_date,
      days_until_expiry: Math.ceil((new Date(d.expiry_date).getTime() - now.getTime()) / 86400000),
      status: d.status,
    }));

    content = <DocumentExpiryTracker documents={mapped} actorId={member.id} />;

  } else if (activeTab === "promotions") {
    const [{ data: ads }, { data: coupons }, { data: banners }] = await Promise.all([
      supabase.from("ads_v2").select("*").order("priority", { ascending: true }),
      supabase.from("coupons_v2").select("*").order("created_at", { ascending: false }),
      supabase.from("hero_banners").select("*").order("sort_order", { ascending: true }),
    ]);

    content = (
      <PromotionsBoard
        ads={(ads ?? []) as any}
        coupons={(coupons ?? []) as any}
        banners={(banners ?? []) as any}
        actorId={member.id}
      />
    );

  } else if (activeTab === "refunds") {
    const cancellationEntries = await fetchCancellationHistory(supabase, { limit: 250 });
    content = <RefundsReviewDashboard entries={cancellationEntries} variant="light" showBookingLinks={false} />;

  } else if (activeTab === "shadow") {
    // SHADOW: Administrative "Watch Session" to assist partners in real-time
    const { data: users } = await supabase
      .from("users")
      .select("id, name, email, role, kyc_status")
      .in("role", ["host", "hommie"])
      .order("name", { ascending: true })
      .limit(100);

    const mapped = (users ?? []).map((u) => ({
      id: u.id,
      name: u.name ?? "Unknown",
      email: u.email ?? "",
      role: u.role ?? "host",
      status: u.kyc_status ?? "pending",
    }));

    content = <ShadowSupport users={mapped} actorId={member.id} actorName={member.name} />;

  } else if (activeTab === "audit") {
    // AUDIT: Accountability logs for all operational decisions
    const [entriesRes, cancellationEntries] = await Promise.all([
      supabase
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      fetchCancellationHistory(supabase, { limit: 100 }),
    ]);

    content = (
      <div style={{ display: "grid", gap: "24px" }}>
        <CancellationTrail entries={cancellationEntries as any} />
        <AuditTrail entries={(entriesRes.data ?? []) as any} />
      </div>
    );
  }

  return (
    <TeamsLayout member={member} activeTab={activeTab}>
      {content}
    </TeamsLayout>
  );
}
