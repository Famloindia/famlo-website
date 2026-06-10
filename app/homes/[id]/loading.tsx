export default function HomeDetailLoading(): React.JSX.Element {
  return (
    <main className="shell" style={{ maxWidth: 1280, paddingTop: 20, paddingBottom: 40 }}>
      <div
        style={{
          display: "grid",
          gap: 18,
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 18 }}>
          <section
            style={{
              background: "#fff",
              borderRadius: 24,
              border: "1px solid #e2e8f0",
              padding: 18,
              boxShadow: "0 10px 40px -10px rgba(0,0,0,0.06)",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "132px minmax(0, 1fr)", gap: 16 }}>
              <div style={{ width: 132, height: 132, borderRadius: 18, background: "#e2e8f0" }} />
              <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
                <div style={{ width: "36%", height: 16, borderRadius: 999, background: "#dbeafe" }} />
                <div style={{ width: "64%", height: 38, borderRadius: 14, background: "#e2e8f0" }} />
                <div style={{ width: "54%", height: 14, borderRadius: 999, background: "#e2e8f0" }} />
                <div style={{ width: "100%", height: 52, borderRadius: 16, background: "#f1f5f9" }} />
              </div>
            </div>
          </section>

          <section
            style={{
              background: "#fff",
              borderRadius: 24,
              border: "1px solid #e2e8f0",
              padding: 22,
              display: "grid",
              gap: 14,
            }}
          >
            <div style={{ width: 180, height: 18, borderRadius: 999, background: "#dbeafe" }} />
            <div style={{ width: "100%", height: 280, borderRadius: 20, background: "#e2e8f0" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} style={{ height: 74, borderRadius: 18, background: "#f1f5f9" }} />
              ))}
            </div>
          </section>
        </div>

        <aside
          style={{
            position: "sticky",
            top: 104,
            display: "grid",
            gap: 14,
            background: "#fff",
            borderRadius: 24,
            border: "1px solid #e2e8f0",
            padding: 18,
            boxShadow: "0 10px 40px -10px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ width: "42%", height: 14, borderRadius: 999, background: "#dbeafe" }} />
          <div style={{ width: "68%", height: 24, borderRadius: 12, background: "#e2e8f0" }} />
          <div style={{ display: "grid", gap: 10 }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} style={{ height: 64, borderRadius: 18, background: "#f1f5f9" }} />
            ))}
          </div>
          <div style={{ height: 52, borderRadius: 18, background: "linear-gradient(135deg,#bfdbfe,#93c5fd)" }} />
        </aside>
      </div>
    </main>
  );
}
