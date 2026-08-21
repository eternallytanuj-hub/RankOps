/**
 * RankOps — Preloader Glowing Brick Matrix Canvas
 */

class PreloaderCanvas {
  constructor() {
    this.canvas = document.querySelector('.preloader-background-pattern__canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.mouseX = -1000;
    this.mouseY = -1000;
    this.progress = 0;
    this.animId = null;
    this.time = 0;
    this.init();
  }

  init() {
    if (!this.canvas || !this.ctx) return;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });

    this.animate();
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  animate() {
    this.animId = requestAnimationFrame(() => this.animate());
    this.time += 0.02;

    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const brickW = 28;
    const brickH = 14;
    const gap = 3;
    const cols = Math.ceil(w / (brickW + gap)) + 1;
    const rows = Math.ceil(h / (brickH + gap)) + 1;

    for (let r = 0; r < rows; r++) {
      const offsetX = (r % 2 === 0) ? 0 : (brickW + gap) / 2;
      for (let c = 0; c < cols; c++) {
        const x = c * (brickW + gap) + offsetX;
        const y = r * (brickH + gap);

        const dx = x + brickW / 2 - this.mouseX;
        const dy = y + brickH / 2 - this.mouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let alpha = 0.035;
        let isCoral = false;

        if (dist < 180) {
          const proximity = 1 - (dist / 180);
          alpha = 0.05 + proximity * 0.35;
          if (dist < 80) isCoral = true;
        }

        // Ambient cyber scanline wave
        const wave = Math.sin(this.time + (y * 0.005) + (x * 0.002));
        if (wave > 0.92) {
          alpha += 0.08;
        }

        this.ctx.fillStyle = isCoral ? `rgba(255, 78, 62, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
        this.ctx.fillRect(x, y, brickW, brickH);

        this.ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.4})`;
        this.ctx.lineWidth = 0.5;
        this.ctx.strokeRect(x, y, brickW, brickH);
      }
    }
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
  }
}

window.PreloaderCanvas = PreloaderCanvas;
