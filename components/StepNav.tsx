"use client";

interface Props {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  hideBack?: boolean;
}

export default function StepNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  hideBack = false,
}: Props) {
  return (
    <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
      {!hideBack ? (
        <button type="button" onClick={onBack} className="btn-secondary">
          ← Back
        </button>
      ) : (
        <span className="hidden sm:block" />
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="btn-primary"
        >
          {nextLabel} →
        </button>
      )}
    </div>
  );
}
