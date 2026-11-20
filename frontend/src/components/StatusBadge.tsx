export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
