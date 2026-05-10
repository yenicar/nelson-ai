"use client";

// Compact circular progress for risk_score. Color follows the band so a
// glance tells you both the magnitude and the band.

interface Props {
  score?: number | null;
  band?: string | null;
  size?: number;
}

export function RiskGauge({ score, band, size = 36 }: Props) {
  const value = Math.max(0, Math.min(100, Math.round(score ?? 0)));
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);

  const color = bandColor(band);

  return (
    <div
      className="relative flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
      aria-label={`Risk score ${value}`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: "stroke-dashoffset 600ms cubic-bezier(0.21, 1.02, 0.73, 1)",
            filter: `drop-shadow(0 0 6px ${color}55)`,
          }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

function bandColor(band?: string | null): string {
  const b = (band || "").toLowerCase();
  if (b.includes("critical")) return "#ef4444";
  if (b.includes("high")) return "#f97316";
  if (b.includes("moderate") || b.includes("elevated")) return "#eab308";
  if (b.includes("low")) return "#22c55e";
  return "#94a3b8";
}
