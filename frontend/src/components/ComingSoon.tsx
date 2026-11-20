import type { ReactNode } from "react";

/** Temporary content for a screen that hasn't been built yet. */
export function ComingSoon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel coming-soon">
      <span className="tag">Coming next</span>
      <h2>{title}</h2>
      <div className="muted">{children}</div>
    </section>
  );
}
