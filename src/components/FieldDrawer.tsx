import React, { useRef } from "react";
import { CornerUpLeft, Trash2, Milestone, HelpCircle } from "lucide-react";

interface Point {
  x: number;
  y: number;
}

interface FieldDrawerProps {
  points: Point[];
  onChange: (points: Point[]) => void;
  readOnly?: boolean;
  size?: number; // width and height in px
}

export default function FieldDrawer({
  points,
  onChange,
  readOnly = false,
  size = 320,
}: FieldDrawerProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Handle click on canvas
  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    // Convert click coordinates to 0..300 range
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 300);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 300);

    // Keep coordinates within bounds
    const boundedX = Math.max(0, Math.min(300, x));
    const boundedY = Math.max(0, Math.min(300, y));

    onChange([...points, { x: boundedX, y: boundedY }]);
  };

  // Undo last point
  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (points.length > 0) {
      onChange(points.slice(0, -1));
    }
  };

  // Clear all points
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  // Remove a specific point when clicked directly
  const handlePointClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (readOnly) return;
    const newPoints = points.filter((_, i) => i !== index);
    onChange(newPoints);
  };

  return (
    <div className="flex flex-col items-center bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-3 shadow-xl">
      <div className="flex items-center justify-between w-full border-b border-slate-800 pb-2">
        <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider font-mono">
          <Milestone className="h-4 w-4 text-indigo-400" />
          Autonomous Path Map
        </span>
        {!readOnly && points.length > 0 && (
          <span className="text-[10px] bg-slate-800 border border-slate-700 text-indigo-300 font-bold px-2 py-0.5 rounded font-mono">
            {points.length} {points.length === 1 ? "point" : "points"}
          </span>
        )}
      </div>

      {/* SVG Canvas */}
      <div 
        className="relative border border-slate-700/80 rounded-lg overflow-hidden shadow-inner bg-slate-950 flex items-center justify-center select-none"
        style={{ width: size, height: size }}
      >
        <svg
          ref={svgRef}
          viewBox="0 0 300 300"
          className={`w-full h-full ${readOnly ? "" : "cursor-crosshair"}`}
          onClick={handleCanvasClick}
        >
          {/* Defined marker arrows for paths */}
          <defs>
            <marker
              id="path-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 2 L 10 5 L 0 8 z" fill="#818cf8" />
            </marker>
          </defs>

          {/* Background Field Image (decodemap.webp) */}
          <image
            href="/decodemap.webp"
            x="0"
            y="0"
            width="300"
            height="300"
            preserveAspectRatio="none"
            transform="rotate(90 150 150)"
          />

          {/* Draw connecting path lines */}
          {points.map((pt, idx) => {
            if (idx === 0) return null;
            const prevPt = points[idx - 1];
            return (
              <line
                key={`line-${idx}`}
                x1={prevPt.x}
                y1={prevPt.y}
                x2={pt.x}
                y2={pt.y}
                stroke="#818cf8"
                strokeWidth="2"
                strokeLinecap="round"
                markerEnd="url(#path-arrow)"
                className="opacity-95"
              />
            );
          })}

          {/* Draw points as glowing dots */}
          {points.map((pt, idx) => {
            const isStart = idx === 0;
            const isEnd = idx === points.length - 1;
            let fillColor = "#818cf8";
            let strokeColor = "#4f46e5";
            let radius = 3.5;

            if (isStart) {
              fillColor = "#10b981"; // green for start point
              strokeColor = "#ffffff";
              radius = 5.0;
            } else if (isEnd) {
              fillColor = "#ec4899"; // pink for end point
              strokeColor = "#ffffff";
              radius = 4.5;
            }

            return (
              <g key={`group-pt-${idx}`}>
                {/* Glow ring */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={radius + 3}
                  fill={fillColor}
                  className="opacity-20 animate-pulse"
                />
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={radius}
                  fill={fillColor}
                  stroke={strokeColor}
                  strokeWidth="1.5"
                  className="transition hover:scale-125 cursor-pointer"
                  onClick={(e) => handlePointClick(idx, e)}
                  title={isStart ? "Start Position" : `Point ${idx + 1}`}
                />
                {/* Show number index for intermediate points */}
                {!isStart && !isEnd && (
                  <text
                    x={pt.x}
                    y={pt.y + 2.5}
                    fill="#1e293b"
                    fontSize="7.5"
                    fontWeight="black"
                    textAnchor="middle"
                    className="pointer-events-none font-mono"
                  >
                    {idx + 1}
                  </text>
                )}
                {isStart && (
                  <text
                    x={pt.x}
                    y={pt.y - radius - 3}
                    fill="#10b981"
                    fontSize="8.5"
                    fontWeight="bold"
                    textAnchor="middle"
                    className="pointer-events-none font-mono drop-shadow-md"
                  >
                    START
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Drawing controls */}
      {!readOnly && (
        <div className="w-full flex flex-col space-y-2.5">
          <div className="flex gap-2 justify-center w-full">
            <button
              type="button"
              disabled={points.length === 0}
              onClick={handleUndo}
              className="flex-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-lg font-mono flex items-center justify-center gap-1.5 border border-slate-700 transition cursor-pointer"
            >
              <CornerUpLeft className="h-3.5 w-3.5 text-indigo-400" />
              Undo Last
            </button>
            <button
              type="button"
              disabled={points.length === 0}
              onClick={handleClear}
              className="flex-1 py-1.5 px-3 bg-red-950/20 hover:bg-red-950/40 disabled:opacity-40 disabled:hover:bg-red-950/20 text-red-400 text-xs font-semibold rounded-lg font-mono flex items-center justify-center gap-1.5 border border-red-900/30 transition cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Path
            </button>
          </div>
          <div className="flex items-start gap-1.5 text-[10px] text-slate-400 bg-slate-950/40 border border-slate-850 p-2 rounded-lg leading-normal">
            <HelpCircle className="h-3.5 w-3.5 text-slate-500 shrink-0 mt-0.5" />
            <p>
              Tap the field to draw the auto path sequence. Tap any individual point to remove it. Baskets / Goals are facing <span className="text-indigo-400 font-bold uppercase">North</span> (top side).
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
