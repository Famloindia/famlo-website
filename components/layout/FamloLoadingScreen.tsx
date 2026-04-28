export default function FamloLoadingScreen(): React.JSX.Element {
  return (
    <div className="famlo-loading-screen" aria-busy="true" aria-live="polite">
      <div className="famlo-loading-card">
        <div className="famlo-loading-mark">
          <div className="famlo-loading-logo">
            <img src="/logo-blue.png" alt="Famlo" />
          </div>
        </div>
        <div className="famlo-loading-bar" />
      </div>
    </div>
  );
}
