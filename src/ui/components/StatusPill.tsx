export function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "warn" }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}
