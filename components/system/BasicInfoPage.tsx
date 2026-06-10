import Link from "next/link";

interface BasicInfoPageProps {
  eyebrow: string;
  title: string;
  description: string;
  body: string[];
}

export function BasicInfoPage({
  eyebrow,
  title,
  description,
  body,
}: Readonly<BasicInfoPageProps>): React.JSX.Element {
  return (
    <main className="shell" style={{ paddingTop: "40px", paddingBottom: "60px" }}>
      <section
        className="panel"
        style={{
          padding: "clamp(24px, 4vw, 48px)",
          display: "grid",
          gap: "20px",
        }}
      >
        <div style={{ display: "grid", gap: "10px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#1A56DB",
            }}
          >
            {eyebrow}
          </span>
          <h1 style={{ margin: 0 }}>{title}</h1>
          <p style={{ margin: 0, color: "#5A6A85", fontSize: "16px", maxWidth: "70ch" }}>
            {description}
          </p>
        </div>

        <div style={{ display: "grid", gap: "14px", color: "#334155" }}>
          {body.map((paragraph) => (
            <p key={paragraph} style={{ margin: 0, lineHeight: 1.8 }}>
              {paragraph}
            </p>
          ))}
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "8px" }}>
          <Link href="/" className="btn-primary" style={{ textDecoration: "none" }}>
            Back to Homepage
          </Link>
          <Link href="/homestays" className="btn-ghost" style={{ textDecoration: "none" }}>
            Browse Homes
          </Link>
        </div>
      </section>
    </main>
  );
}
