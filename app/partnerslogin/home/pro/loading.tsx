import { cookies } from "next/headers";

export default async function FamloProLoading(): Promise<React.JSX.Element> {
  const cookieStore = await cookies();
  const appearanceMode = cookieStore.get("famlo-pro-theme")?.value;
  const isLightMode = appearanceMode === "light";

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: isLightMode
          ? "#ffffff"
          : "radial-gradient(circle at top, rgba(37, 99, 235, 0.16), transparent 34%), #030712",
        color: isLightMode ? "#0f172a" : "#f8fafc",
        padding: "32px",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "min(360px, 62vw)",
          overflow: "hidden",
        }}
      >
        <img
          src="/famlo-pro-logo.png"
          alt="Famlo Pro"
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            position: "relative",
            zIndex: 1,
            filter: "drop-shadow(0 0 20px rgba(59, 130, 246, 0.16))",
          }}
        />

        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: "-16% -24%",
            background:
              "linear-gradient(90deg, transparent 0%, rgba(125, 211, 252, 0.02) 24%, rgba(191, 219, 254, 0.42) 50%, rgba(96, 165, 250, 0.05) 74%, transparent 100%)",
            transform: "translateX(120%) skewX(-22deg)",
            animation: "famlo-logo-shimmer 1.9s ease-in-out infinite",
            zIndex: 2,
            mixBlendMode: "screen",
            filter: "blur(8px)",
            pointerEvents: "none",
          }}
        />

        <style>{`
          @keyframes famlo-logo-shimmer {
            0% {
              transform: translateX(120%) skewX(-22deg);
              opacity: 0;
            }
            18% {
              opacity: 0.88;
            }
            52% {
              opacity: 0.58;
            }
            100% {
              transform: translateX(-138%) skewX(-22deg);
              opacity: 0;
            }
          }
        `}</style>
      </div>
    </main>
  );
}
