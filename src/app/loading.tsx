export default function RootLoading() {
  return (
    <div className="loading-shell">
      <div className="loading-card">
        <div className="loading-bar w-28" />
        <div className="mt-5 loading-bar w-full" />
        <div className="mt-3 loading-bar w-4/5" />
        <div className="mt-8 grid gap-3">
          <div className="loading-bar w-full" />
          <div className="loading-bar w-full" />
          <div className="loading-bar w-3/4" />
        </div>
      </div>
    </div>
  );
}
