type ModuleLoadingShellProps = {
  label?: string;
};

export default function ModuleLoadingShell({
  label = "Chargement de l interface...",
}: ModuleLoadingShellProps) {
  return (
    <div className="loading-shell">
      <div className="loading-card">
        <div className="loading-bar w-32" />
        <div className="mt-5 loading-bar w-full" />
        <div className="mt-3 loading-bar w-4/5" />
        <p className="mt-6 text-sm font-medium text-slate-500">{label}</p>
      </div>
    </div>
  );
}
