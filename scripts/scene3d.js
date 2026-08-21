/**
 * RankOps — 3D Particle Starfield & Concentric Wireframe Mesh
 */

class Scene3D {
  constructor() {
    this.canvas = document.querySelector('canvas.canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.particles = [];
    this.numParticles = 140;
    this.mouseX = 0;
    this.mouseY = 0;
    this.targetMouseX = 0;
    this.targetMouseY = 0;
    this.scrollProgress = 0;
    this.time = 0;
    this.animId = null;

    this.init();
  }

  init() {
    if (!this.canvas || !this.ctx) return;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => {
      this.targetMouseX = (e.clientX - window.innerWidth / 2) * 0.08;
      this.targetMouseY = (e.clientY - window.innerHeight / 2) * 0.08;
    });

    this.initParticles();
    this.animate();
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < this.numParticles; i++) {
      this.particles.push({
        x: (Math.random() - 0.5) * window.innerWidth * 1.5,
        y: (Math.random() - 0.5) * window.innerHeight * 1.5,
        z: Math.random() * 1000 + 100,
        size: Math.random() * 1.4 + 0.6,
        alpha: Math.random() * 0.5 + 0.2
      });
    }
  }

  setScrollProgress(progress) {
    this.scrollProgress = progress;
  }

  animate() {
    this.animId = requestAnimationFrame(() => this.animate());
    this.time += 0.015;

    this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
    this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    this.ctx.clearRect(0, 0, w, h);

    // Render Particle Starfield
    const fov = 400;
    this.particles.forEach((p) => {
      p.z -= 0.6;
      if (p.z <= 10) {
        p.z = 1000;
        p.x = (Math.random() - 0.5) * w * 1.5;
        p.y = (Math.random() - 0.5) * h * 1.5;
      }

      const scale = fov / (p.z + this.scrollProgress * 200);
      const px = cx + (p.x + this.mouseX) * scale;
      const py = cy + (p.y + this.mouseY) * scale;
      const radius = p.size * scale;

      if (px >= 0 && px <= w && py >= 0 && py <= h) {
        this.ctx.beginPath();
        this.ctx.arc(px, py, Math.max(0.5, radius), 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * Math.min(1, scale * 1.5)})`;
        this.ctx.fill();
      }
    });

    // Render Rotating Cybernetic Concentric Wireframes
    const rings = [
      { r: 280, dash: [4, 12], speed: 0.12, alpha: 0.18, color: '255,255,255' },
      { r: 420, dash: [2, 8], speed: -0.08, alpha: 0.22, color: '255,255,255' },
      { r: 560, dash: [1, 16], speed: 0.05, alpha: 0.15, color: '255,78,62' },
      { r: 720, dash: [3, 24], speed: -0.03, alpha: 0.12, color: '255,255,255' }
    ];

    rings.forEach((ring, idx) => {
      this.ctx.save();
      this.ctx.translate(cx + this.mouseX * (0.2 + idx * 0.1), cy + this.mouseY * (0.2 + idx * 0.1));
      this.ctx.rotate(this.time * ring.speed + this.scrollProgress * Math.PI);

      this.ctx.beginPath();
      this.ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
      this.ctx.setLineDash(ring.dash);
      this.ctx.strokeStyle = `rgba(${ring.color}, ${ring.alpha})`;
      this.ctx.lineWidth = 0.8;
      this.ctx.stroke();

      // Concentric Radar Crosshairs
      if (idx === 0) {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, ring.r, 0, Math.PI * 0.4);
        this.ctx.strokeStyle = 'rgba(255, 78, 62, 0.4)';
        this.ctx.lineWidth = 1.2;
        this.ctx.stroke();
      }

      this.ctx.restore();
    });
  }
}

window.Scene3D = Scene3D;
