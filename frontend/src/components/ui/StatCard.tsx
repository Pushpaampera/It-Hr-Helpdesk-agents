/** Shared KPI card for every dashboard page — replaces the identical ad hoc `StatCard` function
 * that used to be copy-pasted into Overview/Costs/ReinforcementLab/HrInsights. Animates its
 * number via useCountUp, optionally renders a tiny trend sparkline (no axes/legend — just a
 * shape) and a +/- delta indicator. */
import type { ReactNode } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { useCountUp } from "../../hooks/useCountUp";
import hover from "../../design/hoverEffects.module.css";
import InfoTooltip from "./InfoTooltip";
import Panel from "./Panel";
import styles from "./StatCard.module.css";

type StatCardProps = {
  label: string;
  value: number;
  unit?: string;
  delta?: number;
  sparklineData?: number[];
  icon?: ReactNode;
  infoText?: string;
};

function formatValue(value: number, isCurrency: boolean): string {
  if (isCurrency) return value.toFixed(value < 1 ? 4 : 2);
  if (Number.isInteger(value)) return Math.round(value).toLocaleString();
  return value.toFixed(value < 10 ? 2 : 1);
}

export default function StatCard({ label, value, unit, delta, sparklineData, icon, infoText }: StatCardProps) {
  const animated = useCountUp(value);
  const isCurrency = unit === "$";
  const display = formatValue(animated, isCurrency);

  return (
    <Panel className={[styles.statCard, hover.liftOnHover].join(" ")}>
      <div className={styles.header}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <span className={styles.label}>{label}</span>
        {infoText && <InfoTooltip text={infoText} />}
      </div>

      <div className={styles.valueRow}>
        <span className={styles.value}>
          {isCurrency ? "$" : ""}
          {display}
          {!isCurrency && unit ? <span className={styles.unit}>{unit}</span> : null}
        </span>
        {typeof delta === "number" && (
          <span className={delta >= 0 ? styles.deltaUp : styles.deltaDown}>
            {delta >= 0 ? "+" : ""}
            {delta.toFixed(1)}%
          </span>
        )}
      </div>

      {sparklineData && sparklineData.length >= 2 && (
        <div className={styles.sparkline}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData.map((v, i) => ({ i, v }))}>
              <defs>
                <linearGradient id={`spark-${label.replace(/\s+/g, "-")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="#8b5cf6"
                strokeWidth={1.5}
                fill={`url(#spark-${label.replace(/\s+/g, "-")})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  );
}
