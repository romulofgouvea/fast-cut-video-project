import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Native tooltip, e.g. the disk-usage breakdown. */
  title?: string;
  loading?: boolean;
  error?: boolean;
};

/** One dashboard metric. Purely presentational. */
export function KpiCard({ label, value, hint, title, loading, error }: Props) {
  return (
    <div className={`kpi-card ${loading ? "kpi-card--loading" : ""}`} title={title}>
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value">{loading ? "…" : error ? "—" : value}</span>
      {hint != null && !loading && <span className="kpi-card__hint">{error ? "—" : hint}</span>}
    </div>
  );
}
