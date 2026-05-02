"use client";

import { formatGBP } from "@/lib/sheets";

interface Props {
  funeralTotal: number;
  disbursementsTotal: number;
}

export default function RunningTotal({ funeralTotal, disbursementsTotal }: Props) {
  const grand = funeralTotal + disbursementsTotal;
  if (grand === 0) return null;

  return (
    <div className="sticky bottom-4 z-10 mt-6 rounded-xl border border-navy-100 bg-white/95 p-4 shadow-soft backdrop-blur sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/with-grace.png"
            alt="With Grace"
            className="h-10 w-auto sm:h-12"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
              (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden");
            }}
          />
          <span className="hidden heading-serif text-lg leading-tight text-navy-900">
            Plan with Grace
          </span>
          <div>
            <span className="block text-xs uppercase tracking-wider text-mist-400">
              Running estimate
            </span>
            <a
              href="https://uk.trustpilot.com/review/funeralswithgrace.com"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 inline-flex items-center gap-1 text-xs text-mist-400 transition hover:text-navy-700"
              aria-label="Read With Grace reviews on Trustpilot (opens in new tab)"
            >
              <span className="text-[#00b67a]">★★★★★</span>
              <span>Reviews on Trustpilot</span>
            </a>
          </div>
        </div>
        <span className="heading-serif text-2xl font-semibold text-navy-900">
          {formatGBP(grand)}
        </span>
      </div>
      {disbursementsTotal > 0 && (
        <p className="mt-2 text-xs text-mist-400">
          Includes {formatGBP(disbursementsTotal)} in estimated third-party costs.
        </p>
      )}
    </div>
  );
}
