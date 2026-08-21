/**
 * RankOps — Application Orchestrator & Bootstrapper
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Core Engines
  const audio = window.daoismAudio;
  const visualizer = new AudioVisualizer();
  const preloaderCanvas = new PreloaderCanvas();
  const scene3d = new Scene3D();
  window.scene3d = scene3d;

  const scrollManager = new ScrollManager();
  window.scrollManager = scrollManager;

  const modals = new ModalsManager();
  window.modals = modals;

  // Custom Cursor
  const cursor = document.querySelector('.custom-cursor');
  if (cursor) {
    window.addEventListener('mousemove', (e) => {
      cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    });

    const interactiveElements = document.querySelectorAll('a, button, input, textarea, .topic-chip, .hotspot, .eye-hotspot-block, .blog-card');
    interactiveElements.forEach((el) => {
      el.addEventListener('mouseenter', () => {
        cursor.classList.add('is-hovering');
        audio?.playHover();
      });
      el.addEventListener('mouseleave', () => {
        cursor.classList.remove('is-hovering');
      });
    });
  }

  // Preloader Start Action
  const startBtns = document.querySelectorAll('.preloader-btn-with-sound button.start, .preloader-sound-toggle');
  startBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const isSoundOn = btn.classList.contains('preloader-sound-toggle') || btn.classList.contains('start');
      if (isSoundOn && audio) {
        audio.unmute();
        audio.playStartChime();
      }

      const preloader = document.querySelector('.preloader-shell');
      if (preloader) {
        preloader.style.opacity = '0';
        preloader.style.transform = 'scale(1.05)';
        setTimeout(() => {
          preloader.style.display = 'none';
          preloaderCanvas.destroy();
        }, 850);
      }
    });
  });

  // Audio Visualizer Toggle Button in Header
  const audioToggle = document.querySelector('.audio-visualiser-btn');
  if (audioToggle && audio) {
    audioToggle.addEventListener('click', (e) => {
      e.preventDefault();
      audio.toggle();
    });
  }

  // Live Berlin / UTC+1 Clock
  const clockEl = document.querySelector('.live-utc-clock');
  const updateClock = () => {
    if (!clockEl) return;
    const now = new Date();
    // UTC+1 Time
    const utcHours = now.getUTCHours() + 1;
    const hours = String((utcHours + 24) % 24).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    clockEl.innerText = `${hours}:${minutes} UTC+1`;
  };
  updateClock();
  setInterval(updateClock, 1000);
});
