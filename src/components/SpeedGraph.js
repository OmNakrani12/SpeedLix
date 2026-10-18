import React, { useRef, useEffect } from "react";

/**
 * High-performance 60fps Real-Time Speed Profile Canvas Chart
 * Plots velocity history over time with smooth area gradient and peak indicator.
 */
export default function SpeedGraph({ history = [], unitLabel = "km/h", maxObserved = 0 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    if (history.length < 2) {
      // Draw idle placeholder line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(10, height / 2);
      ctx.lineTo(width - 10, height / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }

    // Determine scale
    const topValue = Math.max(20, maxObserved * 1.15);
    const paddingX = 8;
    const paddingY = 8;
    const drawWidth = width - paddingX * 2;
    const drawHeight = height - paddingY * 2;

    const points = history.map((val, idx) => {
      const x = paddingX + (idx / (history.length - 1)) * drawWidth;
      const y = paddingY + drawHeight - (Math.min(val, topValue) / topValue) * drawHeight;
      return { x, y, val };
    });

    // Create gradient for fill
    const fillGradient = ctx.createLinearGradient(0, paddingY, 0, height);
    fillGradient.addColorStop(0, "rgba(56, 189, 248, 0.35)");
    fillGradient.addColorStop(0.5, "rgba(16, 185, 129, 0.15)");
    fillGradient.addColorStop(1, "rgba(56, 189, 248, 0.0)");

    // Draw area fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, height);
    points.forEach((p, i) => {
      if (i === 0) {
        ctx.lineTo(p.x, p.y);
      } else {
        const prev = points[i - 1];
        const cx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
      }
    });
    ctx.lineTo(points[points.length - 1].x, height);
    ctx.closePath();
    ctx.fillStyle = fillGradient;
    ctx.fill();

    // Draw stroke line
    const strokeGradient = ctx.createLinearGradient(0, 0, width, 0);
    strokeGradient.addColorStop(0, "#38bdf8");
    strokeGradient.addColorStop(0.7, "#10b981");
    strokeGradient.addColorStop(1, "#f59e0b");

    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        const prev = points[i - 1];
        const cx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
      }
    });
    ctx.strokeStyle = strokeGradient;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw latest head point
    const lastP = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(lastP.x, lastP.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#38bdf8";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [history, maxObserved]);

  const currentVal = history.length > 0 ? history[history.length - 1] : 0;

  return (
    <div className="speed-graph-card">
      <div className="speed-graph-header">
        <div className="speed-graph-title-group">
          <span className="speed-graph-title">Velocity Timeline</span>
          <span className="speed-graph-subtitle">Live real-time profile</span>
        </div>
        <div className="speed-graph-live-badge">
          <span className="speed-graph-pulse" />
          <span>{currentVal.toFixed(1)} {unitLabel}</span>
        </div>
      </div>
      <div className="speed-graph-canvas-wrap">
        <canvas ref={canvasRef} className="speed-graph-canvas" />
      </div>
    </div>
  );
}
