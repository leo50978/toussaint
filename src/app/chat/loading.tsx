export default function ChatLoading() {
  return (
    <div className="loading-shell">
      <div className="loading-card">
        <div className="loading-bar w-32" />
        <div className="mt-5 loading-bar w-full" />
        <div className="mt-3 loading-bar w-2/3" />
        <div className="mt-8 grid gap-4">
          <div className="loading-bar w-full" />
          <div className="loading-bar w-full" />
          <div className="loading-bar w-5/6" />
        </div>
      </div>
    </div>
  );
}
