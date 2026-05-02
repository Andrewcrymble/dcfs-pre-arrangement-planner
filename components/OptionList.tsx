"use client";

import type { PriceItem } from "@/lib/types";
import { formatGBP } from "@/lib/sheets";

interface SingleProps {
  items: PriceItem[];
  selected: string;
  onChange: (name: string) => void;
  showPrice?: boolean;
}

export function OptionListSingle({ items, selected, onChange, showPrice = true }: SingleProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg bg-mist-100 p-4 text-sm text-mist-400">
        No options available. Please check back shortly or contact us directly.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isSelected = selected === item.item_name;
        return (
          <button
            key={item.item_name}
            type="button"
            onClick={() => onChange(item.item_name)}
            data-selected={isSelected}
            className="option-card"
            aria-pressed={isSelected}
          >
            <span
              className={`mt-1 inline-block h-5 w-5 flex-shrink-0 rounded-full border-2 ${
                isSelected ? "border-navy-600 bg-navy-600" : "border-mist-300 bg-white"
              }`}
              aria-hidden
            >
              {isSelected && (
                <span className="block h-full w-full rounded-full border-[3px] border-white" />
              )}
            </span>
            <span className="flex-1">
              <span className="block text-base font-semibold text-navy-900">
                {item.item_name}
              </span>
              {item.description && (
                <span className="mt-0.5 block text-sm text-mist-400">{item.description}</span>
              )}
            </span>
            {showPrice && item.price > 0 && (
              <span className="ml-2 whitespace-nowrap text-sm font-medium text-navy-700">
                {formatGBP(item.price)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface MultiProps {
  items: PriceItem[];
  selected: string[];
  onToggle: (name: string) => void;
  showPrice?: boolean;
}

export function OptionListMulti({ items, selected, onToggle, showPrice = true }: MultiProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg bg-mist-100 p-4 text-sm text-mist-400">
        No options available. Please check back shortly or contact us directly.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const isSelected = selected.includes(item.item_name);
        return (
          <button
            key={item.item_name}
            type="button"
            onClick={() => onToggle(item.item_name)}
            data-selected={isSelected}
            className="option-card"
            aria-pressed={isSelected}
          >
            <span
              className={`mt-1 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-2 ${
                isSelected ? "border-navy-600 bg-navy-600" : "border-mist-300 bg-white"
              }`}
              aria-hidden
            >
              {isSelected && (
                <svg
                  viewBox="0 0 16 16"
                  className="h-3.5 w-3.5 text-white"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M3 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span className="flex-1">
              <span className="block text-base font-semibold text-navy-900">
                {item.item_name}
              </span>
              {item.description && (
                <span className="mt-0.5 block text-sm text-mist-400">{item.description}</span>
              )}
            </span>
            {showPrice && item.price > 0 && (
              <span className="ml-2 whitespace-nowrap text-sm font-medium text-navy-700">
                {formatGBP(item.price)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
