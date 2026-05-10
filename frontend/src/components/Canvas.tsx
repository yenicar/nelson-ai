"use client";

import { useCallback, useEffect, useRef, useState, ReactNode } from "react";

// Bespoke draggable, zoomable canvas. Pan via empty-space drag. Zoom via wheel.
// Children render in a "world" coordinate space; the canvas applies the transform.

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface Props {
  children: ReactNode;
  initial?: Viewport;
  minZoom?: number;
  maxZoom?: number;
}

export function Canvas({ children, initial, minZoom = 0.4, maxZoom = 2.2 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>(
    initial ?? { x: 0, y: 0, zoom: 1 }
  );
  const dragStart = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Start drag only if click landed on the canvas background (not a child).
      if (e.target !== e.currentTarget && (e.target as HTMLElement).closest("[data-card]")) return;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragStart.current = { x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y };
    },
    [viewport.x, viewport.y]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setViewport((v) => ({ ...v, x: dragStart.current!.vx + dx, y: dragStart.current!.vy + dy }));
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    dragStart.current = null;
  }, []);

  // Trackpad pinch + wheel zoom centered on cursor.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 30) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setViewport((v) => {
        const zoomDelta = -e.deltaY * 0.0015;
        const newZoom = Math.max(minZoom, Math.min(maxZoom, v.zoom * (1 + zoomDelta)));
        const ratio = newZoom / v.zoom;
        return {
          zoom: newZoom,
          x: px - (px - v.x) * ratio,
          y: py - (py - v.y) * ratio,
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [minZoom, maxZoom]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
          transition: dragStart.current ? "none" : "transform 120ms ease-out",
        }}
      >
        {children}
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 right-4 glass rounded-full px-3 py-1.5 text-xs font-mono text-white/60 pointer-events-none">
        {Math.round(viewport.zoom * 100)}%
      </div>
    </div>
  );
}
