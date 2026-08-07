"use client";

import { useEffect, useRef } from "react";

type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

type Particle = {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  alpha: number;
  maxAlpha: number;
  life: number;
  maxLife: number;
};

function makeParticle(w: number, h: number, init: boolean): Particle {
  return {
    x: Math.random() * w,
    y: init ? Math.random() * h : h + 10,
    size: Math.random() * 2 + 0.5,
    speedY: -(Math.random() * 0.4 + 0.1),
    speedX: (Math.random() - 0.5) * 0.3,
    alpha: 0,
    maxAlpha: Math.random() * 0.35 + 0.05,
    life: 0,
    maxLife: Math.random() * 300 + 150,
  };
}

export default function LivingCanvas({ color }: { color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colorRef = useRef(hexToRgb(color));
  const targetRef = useRef(hexToRgb(color));

  useEffect(() => {
    targetRef.current = hexToRgb(color);
  }, [color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    let raf = 0;
    let aliveTimer: ReturnType<typeof setTimeout>;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    particles = Array.from({ length: 60 }, () =>
      makeParticle(canvas.width, canvas.height, true),
    );

    aliveTimer = setTimeout(() => canvas.classList.add("alive"), 400);

    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      colorRef.current = lerpColor(colorRef.current, targetRef.current, 0.015);
      const c = colorRef.current;
      for (const p of particles) {
        p.x += p.speedX;
        p.y += p.speedY;
        p.life++;
        if (p.life < 60) p.alpha = (p.life / 60) * p.maxAlpha;
        else if (p.life > p.maxLife - 60)
          p.alpha = ((p.maxLife - p.life) / 60) * p.maxAlpha;
        else p.alpha = p.maxAlpha;
        if (p.life >= p.maxLife) Object.assign(p, makeParticle(canvas.width, canvas.height, false));
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},1)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(aliveTimer);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas id="canvas-bg" ref={canvasRef} aria-hidden />;
}
