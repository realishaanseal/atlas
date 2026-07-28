import { useLayoutEffect, useState, type RefObject } from 'react';
import { buildStrokeSegments } from '@/utils/strokeRender';
import type { Doodle, DoodleStroke } from '@/types';

interface DoodleLayerProps {
  doodles: Doodle[];
  /** The centred message-content element doodles are positioned within. */
  contentRef: RefObject<HTMLDivElement | null>;
  /** Bumps when the message layout changes, forcing a re-measure. */
  revision: number;
}

interface Placed {
  doodle: Doodle;
  top: number;
  width: number;
}

/**
 * Renders the shared doodles as a layer inside the message content, on top of
 * the bubbles but never intercepting them (pointer-events: none).
 *
 * Each doodle is positioned at its anchor message's offset within the content,
 * measured from the DOM — so it rides along as the conversation scrolls and
 * reflows, and simply stops rendering once its anchor has scrolled out of the
 * loaded window. X is a fraction of the content width (the two devices differ),
 * scaled back up here; Y is the pixel offset stored at draw time.
 */
export function DoodleLayer({ doodles, contentRef, revision }: DoodleLayerProps) {
  const [placed, setPlaced] = useState<Placed[]>([]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const measure = () => {
      const contentRect = content.getBoundingClientRect();
      const width = content.clientWidth;
      const next: Placed[] = [];
      for (const doodle of doodles) {
        const anchor = document.getElementById(`msg-${doodle.anchorId}`);
        if (!anchor) continue;
        next.push({ doodle, top: anchor.getBoundingClientRect().top - contentRect.top, width });
      }
      setPlaced(next);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, [doodles, contentRef, revision]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {placed.map(({ doodle, top, width }) => (
        <DoodleSvg key={doodle.id} strokes={doodle.strokes} top={top} width={width} />
      ))}
    </div>
  );
}

function DoodleSvg({ strokes, top, width }: { strokes: DoodleStroke[]; top: number; width: number }) {
  let maxY = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.pts.length; i += 2) maxY = Math.max(maxY, stroke.pts[i] ?? 0);
  }
  const height = maxY + 40;

  return (
    <svg
      className="absolute left-0"
      style={{ top }}
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
    >
      {strokes.map((stroke, index) => {
        const alpha = stroke.tool === 'brush' ? 0.55 : 1;

        if (stroke.pts.length === 2) {
          return (
            <circle
              key={index}
              cx={(stroke.pts[0] ?? 0) * width}
              cy={stroke.pts[1] ?? 0}
              r={stroke.width / 2}
              fill={stroke.color}
              opacity={alpha}
            />
          );
        }

        /**
         * Same builder the drawer's canvas uses, on the same absolute points —
         * so the smoothed curve and the speed-varying width come out identical
         * on both devices rather than the recipient seeing a rougher version.
         * x is stored as a fraction of the content width, scaled back up here.
         */
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < stroke.pts.length; i += 2) {
          points.push({ x: (stroke.pts[i] ?? 0) * width, y: stroke.pts[i + 1] ?? 0 });
        }

        return (
          <g key={index} opacity={alpha}>
            {buildStrokeSegments(points, stroke.width).map((segment, segmentIndex) => (
              <path
                key={segmentIndex}
                d={segment.d}
                fill="none"
                stroke={stroke.color}
                strokeWidth={segment.width}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
