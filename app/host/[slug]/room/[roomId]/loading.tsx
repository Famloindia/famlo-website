export default function HostRoomLoading(): React.JSX.Element {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(24,144,255,0.10), transparent 35%), linear-gradient(180deg, #f7fbff 0%, #ffffff 100%)",
        padding: "24px 20px 40px",
      }}
    >
      <div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gap: 18 }}>
        <section
          style={{
            background: "rgba(255,255,255,0.95)",
            borderRadius: 28,
            border: "1px solid rgba(24,144,255,0.12)",
            padding: 22,
            display: "grid",
            gap: 12,
          }}
        >
          <div style={{ width: 124, height: 14, borderRadius: 999, background: "#dbeafe" }} />
          <div style={{ width: "34%", height: 34, borderRadius: 14, background: "#e2e8f0" }} />
          <div style={{ width: "48%", height: 16, borderRadius: 999, background: "#f1f5f9" }} />
        </section>

        <section
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "minmax(0, 1fr) 380px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 18 }}>
            <div style={{ height: 360, borderRadius: 28, background: "#e2e8f0" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} style={{ height: 120, borderRadius: 20, background: "#f1f5f9" }} />
              ))}
            </div>
          </div>

          <aside
            style={{
              position: "sticky",
              top: 104,
              display: "grid",
              gap: 14,
              background: "rgba(255,255,255,0.96)",
              borderRadius: 24,
              border: "1px solid rgba(24,144,255,0.16)",
              padding: 20,
              boxShadow: "0 16px 35px rgba(15,23,42,0.08)",
            }}
          >
            <div style={{ width: "32%", height: 14, borderRadius: 999, background: "#dbeafe" }} />
            <div style={{ width: "62%", height: 24, borderRadius: 12, background: "#e2e8f0" }} />
            <div style={{ height: 320, borderRadius: 22, background: "#f1f5f9" }} />
            <div style={{ height: 126, borderRadius: 20, background: "#eff6ff" }} />
            <div style={{ height: 52, borderRadius: 18, background: "linear-gradient(135deg,#bfdbfe,#93c5fd)" }} />
          </aside>
        </section>
      </div>
    </main>
  );
}
