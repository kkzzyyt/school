import type { ReactNode } from "react";

export interface LedgerMetric {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
}

interface LedgerSheetProps {
  kicker: string;
  title: string;
  description: string;
  actions?: ReactNode;
  metrics?: LedgerMetric[];
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function LedgerSheet({
  kicker,
  title,
  description,
  actions,
  metrics = [],
  footer,
  className,
  children,
}: LedgerSheetProps) {
  const sheetClassName = ["ledger-sheet", className].filter(Boolean).join(" ");

  return (
    <div className={sheetClassName} data-ledger-sheet="true">
      <header className="ledger-sheet-header">
        <div className="ledger-sheet-heading">
          <div className="ledger-sheet-tag-strip">
            <span className="ledger-sheet-vol-tag font-mono">VOL. 2026 // DOSSIER</span>
            <span className="ledger-sheet-kicker font-mono">ACADEMIC LEDGER · {kicker}</span>
          </div>
          <h1 className="ledger-sheet-title">{title}</h1>
          <p className="ledger-sheet-description">{description}</p>
        </div>

        {(actions || metrics.length > 0) && (
          <div className="ledger-sheet-header-tools">
            {actions && <div className="ledger-sheet-actions">{actions}</div>}
            {metrics.length > 0 && (
              <div className="ledger-sheet-metrics" aria-label="页面统计">
                {metrics.map((metric, index) => (
                  <div className="ledger-sheet-metric-group" key={`${metric.label}-${index}`}>
                    {index > 0 && <span className="ledger-sheet-metric-divider" aria-hidden="true" />}
                    <div className="ledger-sheet-metric">
                      <div className="ledger-sheet-metric-head">
                        <span className="ledger-sheet-metric-label font-mono">{metric.label}</span>
                        {metric.icon && <span className="ledger-sheet-metric-icon" aria-hidden="true">{metric.icon}</span>}
                      </div>
                      <div className="ledger-sheet-metric-value">
                        {metric.value}
                        {metric.unit && <small>{metric.unit}</small>}
                      </div>
                      {metric.detail && <span className="ledger-sheet-metric-detail">{metric.detail}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </header>

      <div className="ledger-sheet-content">{children}</div>

      <footer className="ledger-sheet-colophon">
        <span>QUE-WO-BU-ZHUAN // ACADEMIC OPERATING SYSTEM</span>
        {footer ?? <span>SEC. A-01 · DIGITALLY CERTIFIED BY SIS ENGINE</span>}
        <span>ALL RIGHTS RESERVED // MMXXVI</span>
      </footer>
    </div>
  );
}
