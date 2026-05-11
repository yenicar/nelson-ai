"use client";

// Compact 3-segment bar for sentiment breakdown.
// Two sizes: `compact` (24px wide, fits in a card stat row) and `tile` (full width
// of a parent, taller, with inline counts).

import type { SentimentBreakdown } from "@/lib/types";

interface Props {
  data?: SentimentBreakdown | null;
  variant?: "compact" | "tile";
  showLegend?: boolean;
}

export function SentimentBar({ data, variant = "compact", showLegend = false }: Props) {
  const total = data?.total ?? 0;
  if (!data || total === 0) {
    if (variant === "tile") {
      return <div className="text-[10px] text-white/40 italic">No signals yet</div>;
    }
    return <div className="h-1.5 w-full rounded-full bg-white/5" />;
  }

  const pos = (data.positive / total) * 100;
  const neu = (data.neutral / total) * 100;
  const neg = (data.negative / total) * 100;

  if (variant === "tile") {
    return (
      <div>
        <div className="flex h-2 rounded-full overflow-hidden bg-white/5">
          <div
            className="bg-risk-low transition-all duration-500"
            style={{ width: `${pos}%` }}
            title={`Positive: ${data.positive}`}
          />
          <div
            className="bg-white/25 transition-all duration-500"
            style={{ width: `${neu}%` }}
            title={`Neutral: ${data.neutral}`}
          />
          <div
            className="bg-risk-critical transition-all duration-500"
            style={{ width: `${neg}%` }}
            title={`Negative: ${data.negative}`}
          />
        </div>
        {showLegend && (
          <div className="flex items-center justify-between mt-1.5 text-[10px]">
            <span className="text-risk-low">↑ {data.positive.toLocaleString()}</span>
            <span className="text-white/40">— {data.neutral.toLocaleString()}</span>
            <span className="text-risk-critical">↓ {data.negative.toLocaleString()}</span>
          </div>
        )}
      </div>
    );
  }

  // compact — small bar with optional net hint
  return (
    <div className="flex items-center gap-1.5" title={`+${data.positive} · ${data.neutral} · -${data.negative}`}>
      <div className="flex h-1.5 w-14 rounded-full overflow-hidden bg-white/5">
        <div className="bg-risk-low" style={{ width: `${pos}%` }} />
        <div className="bg-white/25" style={{ width: `${neu}%` }} />
        <div className="bg-risk-critical" style={{ width: `${neg}%` }} />
      </div>
    </div>
  );
}

export function sentimentTone(net: number | undefined | null): string {
  if (net == null) return "text-white/50";
  if (net >= 25) return "text-risk-low";
  if (net <= -25) return "text-risk-critical";
  return "text-white/70";
}
