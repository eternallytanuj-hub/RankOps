/**
 * RankOps — Audio Waveform Visualizer
 */

class AudioVisualizer {
  constructor() {
    this.canvas = document.querySelector('.audio-visualiser__desktop-scope');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.animId = null;
    this.phase = 0;
    this.init();
  }

  init() {
    if (!this.canvas || !this.ctx) return;
    this.render();
  }

  render() {
    this.animId = requestAnimationFrame(() => this.render());
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);

    const isMuted = !window.daoismAudio || window.daoismAudio.isMuted;
    const freqData = window.daoismAudio ? window.daoismAudio.getFrequencyData() : null;

    const numDots = 10;
    const spacing = width / (numDots + 1);

    for (let i = 0; i < numDots; i++) {
      const x = (i + 1) * spacing;
      let amp = 0;

      if (!isMuted && freqData) {
        const binIndex = Math.floor((i / numDots) * (freqData.length / 2));
        amp = (freqData[binIndex] / 255.0) * (height * 0.4);
      } else {
        amp = Math.sin(this.phase + i * 0.5) * 1.5;
      }

      const y = height / 2 - amp;

      this.ctx.beginPath();
      this.ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      this.ctx.fillStyle = isMuted ? 'rgba(168, 174, 188, 0.4)' : '#ff4e3e';
      this.ctx.fill();
    }

    this.phase += 0.05;
  }
}

window.AudioVisualizer = AudioVisualizer;
