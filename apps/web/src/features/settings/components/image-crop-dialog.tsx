'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/features/leads/components/modal';

const VIEW = 280; // the circular window, in CSS pixels
const OUT = 512; // the picture sent to the server

/**
 * Crop and reposition a profile picture: drag the picture (or use the arrow keys) and zoom, with a circular preview of exactly
 * what will be used. The chosen square is drawn to a canvas and that small image is what gets uploaded.
 */
export function ImageCropDialog({
  file,
  onCancel,
  onConfirm,
  busy,
  progress,
  error,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  busy: boolean;
  progress: number | null;
  error: string;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [zoom, setZoom] = useState(1);
  // How far the picture has been moved from centred. Zero is centred, so no effect is needed to place it.
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setLoadErr('That file could not be read as an image.');
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Picture size in the window: it always covers it at zoom 1.
  const base = img ? Math.max(VIEW / img.naturalWidth, VIEW / img.naturalHeight) : 1;
  const w = img ? img.naturalWidth * base * zoom : 0;
  const h = img ? img.naturalHeight * base * zoom : 0;
  const lim = { x: Math.max(0, (w - VIEW) / 2), y: Math.max(0, (h - VIEW) / 2) };
  const clampOff = (x: number, y: number) => ({
    x: Math.min(lim.x, Math.max(-lim.x, x)),
    y: Math.min(lim.y, Math.max(-lim.y, y)),
  });
  const o = clampOff(off.x, off.y);
  const pos = { x: (VIEW - w) / 2 + o.x, y: (VIEW - h) / 2 + o.y };

  const done = () => {
    if (!img) return;
    const scale = img.naturalWidth / w;
    const c = document.createElement('canvas');
    c.width = OUT;
    c.height = OUT;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -pos.x * scale, -pos.y * scale, VIEW * scale, VIEW * scale, 0, 0, OUT, OUT);
    c.toBlob((b) => (b ? onConfirm(b) : undefined), 'image/webp', 0.92);
  };

  return (
    <Modal
      title="Adjust your picture"
      description="Drag to reposition and use the slider to zoom. The circle is what people will see."
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!img} onClick={done}>
            {busy && progress !== null
              ? `Uploading ${Math.round(progress * 100)}%`
              : 'Save picture'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {loadErr ? (
          <p role="alert" className="m-0 text-sm text-danger">
            {loadErr}
          </p>
        ) : (
          <>
            <div
              role="img"
              aria-label="Crop area. Drag the picture to reposition it."
              tabIndex={0}
              className="relative cursor-grab touch-none overflow-hidden rounded-full border border-line bg-wash outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
              style={{ width: VIEW, height: VIEW }}
              onPointerDown={(e) => {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, y: e.clientY, px: o.x, py: o.y };
              }}
              onPointerMove={(e) => {
                if (!drag.current) return;
                setOff(
                  clampOff(
                    drag.current.px + e.clientX - drag.current.x,
                    drag.current.py + e.clientY - drag.current.y,
                  ),
                );
              }}
              onPointerUp={() => (drag.current = null)}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 20 : 6;
                const d: Record<string, [number, number]> = {
                  ArrowLeft: [step, 0],
                  ArrowRight: [-step, 0],
                  ArrowUp: [0, step],
                  ArrowDown: [0, -step],
                };
                const m = d[e.key];
                if (!m) return;
                e.preventDefault();
                setOff((p) => clampOff(p.x - m[0], p.y - m[1]));
              }}
            >
              {img && (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none select-none"
                  style={{ width: w, height: h, left: pos.x, top: pos.y }}
                />
              )}
            </div>
            <label className="flex w-full max-w-[280px] items-center gap-3 text-xs text-muted">
              Zoom
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                aria-label="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-1.5 flex-1 accent-primary"
              />
            </label>
            {busy && progress !== null && (
              <div
                role="progressbar"
                aria-label="Upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}
                className="h-1.5 w-full max-w-[280px] overflow-hidden rounded-full bg-wash-2"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-150"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
