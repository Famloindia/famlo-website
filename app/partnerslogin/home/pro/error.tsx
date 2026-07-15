"use client";

export default function FamloProError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>): React.JSX.Element {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#030712",
        color: "#f8fafc",
        padding: "32px",
      }}
    >
      <section
        style={{
          maxWidth: "960px",
          margin: "0 auto",
          borderRadius: "24px",
          border: "1px solid rgba(248, 113, 113, 0.28)",
          background: "rgba(15, 23, 42, 0.82)",
          padding: "32px",
        }}
      >
        <div style={{ fontSize: "12px", letterSpacing: "0.16em", textTransform: "uppercase", color: "#fca5a5" }}>
          Famlo Pro
        </div>
        <h1 style={{ margin: "12px 0 8px", fontSize: "32px", fontWeight: 800 }}>Workspace crashed locally</h1>
        <p style={{ margin: 0, color: "rgba(226, 232, 240, 0.72)" }}>
          This keeps localhost from turning into a blank screen. Try resetting the route first, then restart with
          `npm run dev:3000` if it happens again.
        </p>
        <div style={{ marginTop: "16px", color: "rgba(248, 250, 252, 0.88)", fontSize: "14px" }}>
          {error.message || "Unknown local runtime error."}
        </div>
        <div style={{ display: "flex", gap: "12px", marginTop: "20px", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={reset}
            style={{
              border: 0,
              borderRadius: "999px",
              padding: "12px 18px",
              fontWeight: 700,
              background: "#e2e8f0",
              color: "#0f172a",
              cursor: "pointer",
            }}
          >
            Retry route
          </button>
          <a
            href="/partnerslogin/home/pro/dashboard"
            style={{
              borderRadius: "999px",
              padding: "12px 18px",
              fontWeight: 700,
              background: "rgba(148, 163, 184, 0.16)",
              color: "#f8fafc",
              textDecoration: "none",
            }}
          >
            Back to Pro dashboard
          </a>
        </div>
      </section>
    </main>
  );
}
