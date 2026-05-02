"use client";

interface Props {
  current: number;
  total: number;
  labels: string[];
}

export default function ProgressBar({ current, total, labels }: Props) {
  const percent = Math.round(((current + 1) / total) * 100);
  return (
    <div className="mb-6 sm:mb-10">
      <div className="mb-3 flex items-baseline justify-between text-xs sm:text-sm">
        <span className="font-medium uppercase tracking-wider text-navy-800">
          Step {current + 1} of {total}
        </span>
        <span className="text-mist-400">{labels[current]}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-mist-200">
        <div
          className="h-full rounded-full bg-gold-500 transition-all duration-500"
          style={{ width: `${percent}%` }}
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
