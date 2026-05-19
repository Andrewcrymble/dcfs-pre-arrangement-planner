"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Port of inscription-preview.html. Canvas draws the selected headstone
// PNG and renders the inscription text on top with the chosen font /
// size / colour / position. The design is stored as a single JSON
// object on the order so the customer-facing proof page can re-render
// it identically.

export interface InscriptionDesign {
  text: string;
  shape: HeadstoneShape;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineSpacing: number;
  letterSpacing: number;
  colour: string;
  posX: number; // 0–100 (%)
  posY: number; // 0–100 (%)
  maxWidth: number; // 0–100 (%)
  shadowBlur: number;
  opacity: number;
}

export type HeadstoneShape =
  | "ogee"
  | "g3"
  | "densmore"
  | "halfdensmore"
  | "murphy";

export const HEADSTONE_SHAPES: { value: HeadstoneShape; label: string }[] = [
  { value: "ogee", label: "Ogee" },
  { value: "g3", label: "G3" },
  { value: "densmore", label: "Densmore" },
  { value: "halfdensmore", label: "Half Densmore" },
  { value: "murphy", label: "Murphy" },
];

const FONTS = [
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', serif", label: "Times New Roman" },
  { value: "'Palatino Linotype', serif", label: "Palatino" },
  { value: "'Garamond', serif", label: "Garamond" },
  { value: "'Trajan Pro', 'Times New Roman', serif", label: "Trajan" },
  { value: "'Book Antiqua', serif", label: "Book Antiqua" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "Arial, sans-serif", label: "Arial" },
];

const SWATCHES = [
  { hex: "#c8a84b", title: "Gold" },
  { hex: "#e8d5a3", title: "Light Gold" },
  { hex: "#e0e0e0", title: "Silver" },
  { hex: "#ffffff", title: "White" },
  { hex: "#d4af37", title: "Deep Gold" },
  { hex: "#1c1c1e", title: "Black" },
];

export const DEFAULT_INSCRIPTION_DESIGN: InscriptionDesign = {
  text: "In Loving Memory of\nJOHN SMITH\nBeloved Husband & Father\n1945 — 2024\nRest In Peace",
  shape: "ogee",
  fontFamily: "'Times New Roman', serif",
  fontStyle: "normal",
  fontSize: 22,
  lineSpacing: 1.7,
  letterSpacing: 2,
  colour: "#c8a84b",
  posX: 50,
  posY: 42,
  maxWidth: 52,
  shadowBlur: 3,
  opacity: 0.95,
};

// Stand-alone draw function that other components (proof page, PDF
// generator) can reuse. Pass any canvas + a loaded image and a design.
export function drawInscription(
  canvas: HTMLCanvasElement,
  hsImage: HTMLImageElement,
  design: InscriptionDesign,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(hsImage, 0, 0, canvas.width, canvas.height);

  const text = design.text || "";
  const scale = canvas.width / 560;
  const scaledSize = Math.round(design.fontSize * scale);
  const scaledLineH = scaledSize * design.lineSpacing;
  const cx = canvas.width * (design.posX / 100);
  const startY = canvas.height * (design.posY / 100);
  const maxW = canvas.width * (design.maxWidth / 100);

  ctx.save();
  ctx.globalAlpha = design.opacity;
  ctx.fillStyle = design.colour;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${design.fontStyle} ${scaledSize}px ${design.fontFamily}`;

  if (design.shadowBlur > 0) {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = design.shadowBlur * scale;
    ctx.shadowOffsetX = 1 * scale;
    ctx.shadowOffsetY = 1 * scale;
  }

  const lines = text.split("\n");
  const totalH = lines.length * scaledLineH;
  const topY = startY - totalH / 2;

  lines.forEach((line, i) => {
    const y = topY + i * scaledLineH + scaledLineH / 2;
    drawTextWithSpacing(
      ctx,
      line.trim(),
      cx,
      y,
      maxW,
      design.letterSpacing * scale,
    );
  });

  ctx.restore();
}

function drawTextWithSpacing(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  spacing: number,
) {
  if (!text) return;
  if (spacing === 0) {
    ctx.fillText(text, cx, y);
    return;
  }
  let totalW = 0;
  for (let i = 0; i < text.length; i++) {
    totalW +=
      ctx.measureText(text[i]).width + (i < text.length - 1 ? spacing : 0);
  }
  let scaleX = 1;
  if (totalW > maxWidth) scaleX = maxWidth / totalW;
  let x = cx - (totalW * scaleX) / 2;
  for (let i = 0; i < text.length; i++) {
    const charW = ctx.measureText(text[i]).width * scaleX;
    ctx.fillText(text[i], x + charW / 2, y);
    x += charW + spacing * scaleX;
  }
}

export default function InscriptionDesigner({
  value,
  onChange,
  // Optional letter-count callback so the editor can update its
  // inscription pricing as the staff member types.
  onLetterCount,
}: {
  value: InscriptionDesign;
  onChange: (next: InscriptionDesign) => void;
  onLetterCount?: (count: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hsImage, setHsImage] = useState<HTMLImageElement | null>(null);
  const [imgErr, setImgErr] = useState(false);

  // Reload image when shape changes
  useEffect(() => {
    setImgErr(false);
    setHsImage(null);
    const img = new Image();
    img.onload = () => setHsImage(img);
    img.onerror = () => setImgErr(true);
    img.src = `/headstones/${value.shape}.png`;
  }, [value.shape]);

  // Resize canvas to match image (capped at 560px wide), then render.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hsImage) return;
    const maxW = 560;
    const scale = Math.min(maxW / hsImage.width, 1);
    canvas.width = hsImage.width * scale;
    canvas.height = hsImage.height * scale;
    drawInscription(canvas, hsImage, value);
  }, [hsImage, value]);

  // Letter count (alphanumeric only — matches how Apps Script counts).
  useEffect(() => {
    if (!onLetterCount) return;
    const count = (value.text.match(/[A-Za-z0-9]/g) || []).length;
    onLetterCount(count);
  }, [value.text, onLetterCount]);

  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const cx = (e.clientX - rect.left) * scaleX;
      const cy = (e.clientY - rect.top) * scaleY;
      onChange({
        ...value,
        posX: Math.round((cx / canvas.width) * 100),
        posY: Math.round((cy / canvas.height) * 100),
      });
    },
    [value, onChange],
  );

  const set = <K extends keyof InscriptionDesign>(k: K, v: InscriptionDesign[K]) =>
    onChange({ ...value, [k]: v });

  const letterCount = useMemo(
    () => (value.text.match(/[A-Za-z0-9]/g) || []).length,
    [value.text],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      <div className="space-y-3">
        <div className="rounded-xl bg-white p-3 shadow-soft">
          <p className="field-label">Headstone shape</p>
          <select
            className="field-input"
            value={value.shape}
            onChange={(e) => set("shape", e.target.value as HeadstoneShape)}
          >
            {HEADSTONE_SHAPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-soft">
          <label className="field-label">
            Inscription <span className="text-mist-400">({letterCount} letters)</span>
          </label>
          <textarea
            className="field-input"
            rows={6}
            value={value.text}
            onChange={(e) => set("text", e.target.value)}
            placeholder="One line per row…"
          />
        </div>

        <div className="rounded-xl bg-white p-3 shadow-soft">
          <p className="field-label">Font &amp; style</p>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="field-input"
              value={value.fontFamily}
              onChange={(e) => set("fontFamily", e.target.value)}
            >
              {FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              className="field-input"
              value={value.fontStyle}
              onChange={(e) => set("fontStyle", e.target.value)}
            >
              <option value="normal">Normal</option>
              <option value="italic">Italic</option>
              <option value="bold">Bold</option>
              <option value="bold italic">Bold Italic</option>
            </select>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
            <Slider
              label={`Font size — ${value.fontSize}px`}
              min={10}
              max={60}
              step={1}
              value={value.fontSize}
              onChange={(n) => set("fontSize", n)}
            />
            <Slider
              label={`Line spacing — ${value.lineSpacing.toFixed(2)}×`}
              min={1}
              max={3}
              step={0.05}
              value={value.lineSpacing}
              onChange={(n) => set("lineSpacing", n)}
            />
            <Slider
              label={`Letter spacing — ${value.letterSpacing}px`}
              min={-2}
              max={12}
              step={0.5}
              value={value.letterSpacing}
              onChange={(n) => set("letterSpacing", n)}
            />
          </div>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-soft">
          <p className="field-label">Colour</p>
          <div className="flex flex-wrap gap-2">
            {SWATCHES.map((s) => (
              <button
                key={s.hex}
                type="button"
                title={s.title}
                onClick={() => set("colour", s.hex)}
                style={{ background: s.hex }}
                className={
                  "h-8 w-8 rounded-md transition " +
                  (value.colour === s.hex
                    ? "ring-2 ring-navy-700 ring-offset-1"
                    : "ring-1 ring-mist-200")
                }
              />
            ))}
            <input
              type="color"
              value={value.colour}
              onChange={(e) => set("colour", e.target.value)}
              className="h-8 w-12 cursor-pointer rounded-md border border-mist-200"
            />
          </div>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-soft">
          <p className="field-label">Position</p>
          <div className="grid grid-cols-1 gap-2 text-xs">
            <Slider
              label={`Vertical — ${value.posY}%`}
              min={10}
              max={90}
              step={1}
              value={value.posY}
              onChange={(n) => set("posY", n)}
            />
            <Slider
              label={`Horizontal — ${value.posX}%`}
              min={20}
              max={80}
              step={1}
              value={value.posX}
              onChange={(n) => set("posX", n)}
            />
            <Slider
              label={`Max width — ${value.maxWidth}%`}
              min={20}
              max={90}
              step={1}
              value={value.maxWidth}
              onChange={(n) => set("maxWidth", n)}
            />
            <p className="text-mist-400">Click the preview to set position.</p>
          </div>
        </div>

        <div className="rounded-xl bg-white p-3 shadow-soft">
          <p className="field-label">Effects</p>
          <div className="grid grid-cols-1 gap-2 text-xs">
            <Slider
              label={`Shadow — ${value.shadowBlur}px`}
              min={0}
              max={12}
              step={0.5}
              value={value.shadowBlur}
              onChange={(n) => set("shadowBlur", n)}
            />
            <Slider
              label={`Opacity — ${Math.round(value.opacity * 100)}%`}
              min={0.3}
              max={1}
              step={0.01}
              value={value.opacity}
              onChange={(n) => set("opacity", n)}
            />
          </div>
        </div>

        <button
          type="button"
          className="btn-secondary w-full"
          onClick={() =>
            onChange({ ...DEFAULT_INSCRIPTION_DESIGN, shape: value.shape, text: value.text })
          }
        >
          Reset style
        </button>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-soft">
        <p className="field-label">Live preview</p>
        {imgErr && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Couldn&apos;t load /headstones/{value.shape}.png — check that the
            file exists in public/headstones/.
          </p>
        )}
        <div className="flex flex-col items-center gap-2">
          <canvas
            ref={canvasRef}
            onClick={onCanvasClick}
            className="max-w-full cursor-crosshair rounded-md shadow-soft"
          />
          <p className="text-xs text-mist-400">
            Click anywhere on the canvas to reposition the inscription.
          </p>
        </div>
      </div>
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-mist-400">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-0.5 w-full accent-navy-700"
      />
    </label>
  );
}
