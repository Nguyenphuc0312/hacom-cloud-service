export const DashboardLoadingState = () => (
  <div className="ds-dashboard-layout ds-dashboard-layout--loading" aria-hidden="true">
    <section className="ds-dashboard-span-8 ds-dashboard-loading-panel ds-dashboard-loading-panel-lg">
      <div className="ds-skeleton ds-dashboard-loading-line ds-dashboard-loading-line-sm" />
      <div className="ds-skeleton ds-dashboard-loading-line ds-dashboard-loading-line-xl" />
      <div className="ds-skeleton ds-dashboard-loading-line ds-dashboard-loading-line-md" />
      <div className="ds-dashboard-loading-stats">
        <div className="ds-skeleton ds-dashboard-loading-tile" />
        <div className="ds-skeleton ds-dashboard-loading-tile" />
        <div className="ds-skeleton ds-dashboard-loading-tile" />
      </div>
    </section>
    <section className="ds-dashboard-span-4 ds-dashboard-loading-panel">
      <div className="ds-skeleton ds-dashboard-loading-line ds-dashboard-loading-line-sm" />
      <div className="ds-skeleton ds-dashboard-loading-line ds-dashboard-loading-line-md" />
      <div className="ds-dashboard-loading-list">
        <div className="ds-skeleton ds-dashboard-loading-row" />
        <div className="ds-skeleton ds-dashboard-loading-row" />
        <div className="ds-skeleton ds-dashboard-loading-row" />
      </div>
    </section>
    {Array.from({ length: 6 }).map((_, index) => (
      <section key={index} className="ds-dashboard-span-2 ds-dashboard-loading-card">
        <div className="ds-skeleton ds-dashboard-loading-line ds-dashboard-loading-line-sm" />
        <div className="ds-skeleton ds-dashboard-loading-line ds-dashboard-loading-line-lg" />
        <div className="ds-skeleton ds-dashboard-loading-sparkline" />
      </section>
    ))}
    <section className="ds-dashboard-span-8 ds-dashboard-loading-panel ds-dashboard-loading-chart" />
    <section className="ds-dashboard-span-4 ds-dashboard-loading-panel">
      <div className="ds-skeleton ds-dashboard-loading-line ds-dashboard-loading-line-sm" />
      <div className="ds-dashboard-loading-list">
        <div className="ds-skeleton ds-dashboard-loading-row" />
        <div className="ds-skeleton ds-dashboard-loading-row" />
        <div className="ds-skeleton ds-dashboard-loading-row" />
      </div>
    </section>
    <section className="ds-dashboard-span-7 ds-dashboard-loading-panel ds-dashboard-loading-chart" />
    <section className="ds-dashboard-span-5 ds-dashboard-loading-panel">
      <div className="ds-dashboard-loading-list">
        <div className="ds-skeleton ds-dashboard-loading-row" />
        <div className="ds-skeleton ds-dashboard-loading-row" />
        <div className="ds-skeleton ds-dashboard-loading-row" />
        <div className="ds-skeleton ds-dashboard-loading-row" />
      </div>
    </section>
  </div>
);
