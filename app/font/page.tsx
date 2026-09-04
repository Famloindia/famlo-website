export const metadata = {
  title: "Famlo Font",
  description: "Famlo SemiBold — a friendly rounded open typeface by Famlo Traveltech Private Limited."
};

export default function FamloFontPage() {
  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "64px 24px 96px" }}>
      <link rel="stylesheet" href="/fonts/famlo.css" />
      <p style={{ letterSpacing: ".18em", textTransform: "uppercase", fontSize: 12, color: "#667085", fontWeight: 700 }}>
        Open typeface · Version 1.000
      </p>
      <h1 className="font-famlo" style={{ fontSize: "clamp(88px, 18vw, 220px)", lineHeight: .85, margin: "30px 0 24px", color: "#1688f4" }}>
        Famlo
      </h1>
      <p style={{ maxWidth: 760, fontSize: 19, lineHeight: 1.7, color: "#667085" }}>
        Famlo is a friendly rounded display typeface created for warm, modern travel and homestay experiences. It is released under the SIL Open Font License 1.1.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "28px 0 54px" }}>
        <a href="/fonts/Famlo-SemiBold.otf" download style={{ background: "#1688f4", color: "white", padding: "13px 18px", borderRadius: 12, textDecoration: "none", fontWeight: 700 }}>Download OTF</a>
        <a href="/fonts/Famlo-SemiBold.woff2" download style={{ border: "1px solid #e7edf5", color: "#0e1b2a", padding: "13px 18px", borderRadius: 12, textDecoration: "none", fontWeight: 700 }}>Download WOFF2</a>
        <a href="/fonts/OFL.txt" style={{ border: "1px solid #e7edf5", color: "#0e1b2a", padding: "13px 18px", borderRadius: 12, textDecoration: "none", fontWeight: 700 }}>License</a>
      </div>

      {[
        ["Uppercase", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
        ["Lowercase", "abcdefghijklmnopqrstuvwxyz"],
        ["Numbers & symbols", "0123456789 ₹ € £ ! @ # $ % & * + = ?"]
      ].map(([label, sample]) => (
        <section key={label} style={{ border: "1px solid #e7edf5", borderRadius: 22, padding: 28, marginTop: 20 }}>
          <div style={{ letterSpacing: ".16em", textTransform: "uppercase", fontSize: 12, color: "#667085", fontWeight: 700, marginBottom: 18 }}>{label}</div>
          <div className="font-famlo" style={{ fontSize: "clamp(38px, 6vw, 72px)", lineHeight: 1.25, color: "#1688f4", overflowWrap: "anywhere" }}>{sample}</div>
        </section>
      ))}

      <section style={{ border: "1px solid #e7edf5", borderRadius: 22, padding: 28, marginTop: 20 }}>
        <div style={{ letterSpacing: ".16em", textTransform: "uppercase", fontSize: 12, color: "#667085", fontWeight: 700, marginBottom: 18 }}>Use on the web</div>
        <pre style={{ overflowX: "auto", background: "#f8fbff", borderRadius: 14, padding: 20, lineHeight: 1.6 }}>{`@font-face {
  font-family: "Famlo";
  src: url("/fonts/Famlo-SemiBold.woff2") format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}`}</pre>
      </section>

      <footer style={{ marginTop: 48, color: "#667085", fontSize: 14 }}>
        Famlo Font · Copyright © 2026 Famlo Traveltech Private Limited · SIL Open Font License 1.1
      </footer>
    </main>
  );
}
