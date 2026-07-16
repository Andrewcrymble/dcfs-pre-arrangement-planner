"use client";

interface Props {
  current: number;
  total: number;
  labels: string[];
  // When provided, the step chips become clickable so the arranger can jump
  // straight to any section instead of paging Next/Back through all ten.
  onJump?: (index: number) => void;
}

export default function ProgressBar({ current, total, labels, onJump }: Props) {
  const percent = Math.round(((current + 1) / total) * 100);
  return (
    <div className="mb-6 sm:mb-8">
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
      {onJump && (
        <nav aria-label="Estimate sections" className="mt-3 flex flex-wrap gap-1.5">
          {labels.map((label, i) => (
            <button
              key={label + i}
              type="button"
              onClick={() => onJump(i)}
              aria-current={i === current ? "step" : undefined}
              title={label}
              className={
                "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                (i === current
                  ? "border-gold-500 bg-gold-500 text-white"
                  : i < current
                    ? "border-navy-200 bg-navy-50 text-navy-800 hover:border-navy-400"
                    : "border-mist-300 bg-white text-navy-700 hover:border-navy-400")
              }
            >
              <span className="tabular-nums">{i + 1}</span>
              <span className="ml-1 hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
