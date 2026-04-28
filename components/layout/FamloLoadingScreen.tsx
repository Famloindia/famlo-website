import Image from "next/image";

export default function FamloLoadingScreen(): React.JSX.Element {
  return (
    <div className="famlo-loading-screen" aria-busy="true" aria-live="polite">
      <div className="famlo-loading-card">
        <div className="famlo-loading-mark">
          <div className="famlo-loading-logo">
            <Image src="/logo-blue.png" alt="Famlo" width={1024} height={344} sizes="160px" />
          </div>
        </div>
        <div className="famlo-loading-bar" />
      </div>
    </div>
  );
}
