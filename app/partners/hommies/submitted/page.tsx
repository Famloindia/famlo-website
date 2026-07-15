import Link from "next/link";

import { createAdminSupabaseClient } from "@/lib/supabase";

interface SubmittedPageProps {
  searchParams?: Promise<{
    application?: string;
  }>;
}

export default async function HommieSubmittedPage({
  searchParams
}: Readonly<SubmittedPageProps>): Promise<React.JSX.Element> {
  const params = await searchParams;
  const applicationId = params?.application ?? "";
  const supabase = createAdminSupabaseClient();

  const { data: application } = applicationId
    ? await supabase
        .from("friend_applications")
        .select("id,full_name,email,city,state,bio,languages,interests,status")
        .eq("id", applicationId)
        .maybeSingle()
    : { data: null };

  const { data: v2Application } = applicationId
    ? await supabase
        .from("hommie_applications_v2")
        .select("id,status,payload,submitted_at,reviewed_at")
        .contains("payload", { legacy_application_id: applicationId })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const row = application as Record<string, unknown> | null;
  const languages = Array.isArray(row?.languages) ? row.languages.filter((item): item is string => typeof item === "string") : [];
  const interests = Array.isArray(row?.interests) ? row.interests.filter((item): item is string => typeof item === "string") : [];

  return (
    <main className="shell">
      <section className="panel dashboard-shell">
        <div className="dashboard-header">
          <div>
            <span className="eyebrow">Submitted</span>
            <h1>Your hommie application is in review</h1>
            <p>
              Your submission is now tracked in both `friend_applications` and `hommie_applications_v2`.
              Admin or teams approval provisions the shared `hommie_profiles_v2` partner path from this flow.
            </p>
          </div>
          <div className="dashboard-links">
            <Link href={`/partnerslogin/hommie/dashboard?application=${applicationId}`}>Open Hommie Dashboard</Link>
            <Link href="/partners/hommies">Start another application</Link>
          </div>
        </div>

        <div className="grid two-up dashboard-grid">
          <section className="panel detail-box">
            <h2>Application snapshot</h2>
            <ul>
              <li>Name: {String(row?.full_name ?? "Pending")}</li>
              <li>Email: {String(row?.email ?? "Pending")}</li>
              <li>City: {[row?.city, row?.state].filter(Boolean).join(", ") || "Pending"}</li>
              <li>Status: {String(row?.status ?? "pending")}</li>
              <li>Application ID: {applicationId || "Not found"}</li>
              <li>V2 status: {String(v2Application?.status ?? "pending")}</li>
            </ul>
          </section>

          <section className="panel detail-box">
            <h2>Identity summary</h2>
            <ul>
              <li>Languages: {languages.join(", ") || "Pending"}</li>
              <li>Interests: {interests.join(", ") || "Pending"}</li>
            </ul>
          </section>

          <section className="panel detail-box">
            <h2>What is connected now</h2>
            <ul>
              <li>Submission writes to `friend_applications` and `hommie_applications_v2`.</li>
              <li>Admin approval already reads this queue.</li>
              <li>Approved hommie profiles appear in `hommie_profiles_v2`.</li>
            </ul>
          </section>

          <section className="panel detail-box">
            <h2>Still pending</h2>
            <p>
              This is still a compatibility flow while we migrate discovery and dashboards fully onto
              `hommie_profiles_v2`.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
