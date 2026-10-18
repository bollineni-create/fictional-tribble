// Minimal canvas line chart with buy/sell markers and a hover readout.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function lineChart(canvas, { time, series, markers = [], format = (v) => v.toFixed(2) }) {
  const dpr = window.devicePixelRatio || 1;
  const pad = { l: 8, r: 64, t: 12, b: 24 };
  let hover = null;

  function draw() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const n = time.length;
    if (n < 2) return;
    const vals = series.flatMap((s) => s.values.filter(Number.isFinite));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (lo === hi) { lo -= 1; hi += 1; }
    const span = hi - lo;
    lo -= span * 0.05; hi += span * 0.05;
    const x = (i) => pad.l + (i / (n - 1)) * (w - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);

    ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = css("--muted");
    ctx.strokeStyle = css("--grid");
    ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const v = lo + ((hi - lo) * k) / 4, yy = Math.round(y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke();
      ctx.fillText(format(v), w - pad.r + 6, yy + 4);
    }
    const ticks = Math.max(1, Math.min(4, Math.floor((w - pad.l - pad.r) / 110)));
    for (let k = 0; k <= ticks; k++) {
      const i = Math.round((k / ticks) * (n - 1));
      const label = new Date(time[i]).toISOString().slice(0, 10);
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, Math.min(Math.max(x(i) - tw / 2, pad.l), w - pad.r - tw), h - 6);
    }

    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width ?? 1.5;
      ctx.setLineDash(s.dash ?? []);
      ctx.beginPath();
      let started = false;
      s.values.forEach((v, i) => {
        if (!Number.isFinite(v)) { started = false; return; }
        started ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v));
        started = true;
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const m of markers) {
      const mx = x(m.index), my = y(m.value), up = m.type === "buy";
      ctx.fillStyle = up ? css("--up") : css("--down");
      ctx.beginPath();
      ctx.moveTo(mx, my + (up ? 6 : -6));
      ctx.lineTo(mx - 5, my + (up ? 14 : -14));
      ctx.lineTo(mx + 5, my + (up ? 14 : -14));
      ctx.fill();
    }

    if (hover != null) {
      const hx = x(hover);
      ctx.strokeStyle = css("--muted");
      ctx.beginPath(); ctx.moveTo(hx, pad.t); ctx.lineTo(hx, h - pad.b); ctx.stroke();
      const lines = [new Date(time[hover]).toISOString().slice(0, 10), ...series.filter((s) => s.label).map((s) => `${s.label}: ${Number.isFinite(s.values[hover]) ? format(s.values[hover]) : "–"}`)];
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16, bh = lines.length * 16 + 8;
      const bx = hx + 12 + bw > w - pad.r ? hx - bw - 12 : hx + 12;
      ctx.fillStyle = css("--surface-2");
      ctx.strokeStyle = css("--border");
      ctx.beginPath(); ctx.roundRect(bx, pad.t, bw, bh, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = css("--text");
      lines.forEach((l, k) => ctx.fillText(l, bx + 8, pad.t + 18 + k * 16));
    }
  }

  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect();
    const frac = (e.clientX - r.left - pad.l) / (r.width - pad.l - pad.r);
    hover = Math.max(0, Math.min(time.length - 1, Math.round(frac * (time.length - 1))));
    draw();
  };
  canvas.onmouseleave = () => { hover = null; draw(); };
  draw();
  return { redraw: draw };
}
