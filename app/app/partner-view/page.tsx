import Link from "next/link";

interface PartnerViewPageProps {
  searchParams: Promise<{
    shadow?: string;
  }>;
}

export default async function PartnerViewPage({
  searchParams
}: Readonly<PartnerViewPageProps>): Promise<React.JSX.Element> {
  const { shadow } = await searchParams;

  return (
    <main className="shell">
      <section className="panel" style={{ maxWidth: 720, margin: "48px auto" }}>
        <span className="eyebrow">Support Preview</span>
        <h1 style={{ marginTop: 12 }}>Partner view route is now connected</h1>
        <p style={{ color: "#475569", lineHeight: 1.7 }}>
          The shadow-support link no longer returns a 404. A full read-only dashboard preview has
          not been implemented yet, but this route now loads correctly and preserves the shadow
          session reference for follow-up work.
        </p>
        <div
          style={{
            marginTop: 20,
            padding: "16px 18px",
            borderRadius: 16,
            border: "1px solid #dbeafe",
            background: "#f8fbff"
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, color: "#0f4c81", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Shadow Session
          </div>
          <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
            {shadow || "No shadow session id provided"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <Link href="/teams" className="btn-primary" style={{ textDecoration: "none" }}>
            Back to Teams
          </Link>
          <Link href="/" className="btn-ghost" style={{ textDecoration: "none" }}>
            Public homepage
          </Link>
        </div>
      </section>
    </main>
  );
}
