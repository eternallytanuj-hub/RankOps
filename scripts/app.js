/**
 * RankOps — Application Orchestrator & Bootstrapper
 */

class StatsManager {
  constructor() {
    this.counters = document.querySelectorAll('.stat-counter-val[data-stat]');
    this.feedGrid = document.querySelector('.live-recent-audits-grid');
    this.init();
  }

  async init() {
    await this.fetchAndRenderStats();

    // Re-fetch on completed audits
    window.addEventListener('rankops:audit-complete', () => {
      this.fetchAndRenderStats();
    });
  }

  async fetchAndRenderStats() {
    try {
      const resp = await fetch('/api/stats/overview');
      if (!resp.ok) return;
      const json = await resp.json();
      if (json && json.data) {
        this.renderMetrics(json.data);
        this.renderRecentFeed(json.data.recentAudits || []);
      }
    } catch (e) {
      console.warn('[RankOps StatsManager] Could not load live stats, using defaults.');
    }
  }

  animateValue(element, start, end, duration, formatFn) {
    if (!element) return;
    const startTime = performance.now();

    const update = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const currentVal = Math.floor(start + (end - start) * easedProgress);

      element.innerText = formatFn ? formatFn(currentVal) : currentVal.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        element.innerText = formatFn ? formatFn(end) : end.toLocaleString();
      }
    };

    requestAnimationFrame(update);
  }

  renderMetrics(data) {
    this.counters.forEach(counter => {
      const statKey = counter.getAttribute('data-stat');
      if (statKey === 'totalFiles') {
        const val = data.totalFilesScanned || 128450;
        this.animateValue(counter, Math.max(0, val - 1500), val, 1400, (n) => `${n.toLocaleString()}+`);
      } else if (statKey === 'totalAudits') {
        const val = data.totalAudits || 48;
        this.animateValue(counter, Math.max(0, val - 10), val, 1200, (n) => `${n}`);
      } else if (statKey === 'aiDirectives') {
        const val = data.aiDirectivesDeployed || 412;
        this.animateValue(counter, Math.max(0, val - 40), val, 1400, (n) => `${n.toLocaleString()}+`);
      } else if (statKey === 'avgScoreGain') {
        const val = data.avgScoreImprovement || 38;
        this.animateValue(counter, 0, val, 1000, (n) => `+${n} pts`);
      }
    });
  }

  renderRecentFeed(recentAudits) {
    if (!this.feedGrid) return;
    this.feedGrid.innerHTML = '';

    recentAudits.slice(0, 4).forEach((audit) => {
      const card = document.createElement('div');
      card.className = 'live-recent-card';
      card.setAttribute('data-quick-repo', `https://github.com/${audit.repo}`);

      const timeAgo = this.formatTimeAgo(audit.timestamp);

      card.innerHTML = `
        <div class="live-recent-card-header">
          <span class="live-recent-repo-name">${audit.repo}</span>
          <span class="live-recent-score-badge">${audit.scoreAfter}/100 (${audit.scoreDelta})</span>
        </div>
        <div class="live-recent-card-meta">
          <span>Branch: ${audit.defaultBranch || 'main'}</span>
          <span>${timeAgo}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        if (window.modals) {
          window.modals.openAuditModal();
          const input = document.querySelector('.connect-input');
          if (input) {
            input.value = `https://github.com/${audit.repo}`;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const submitBtn = document.querySelector('.audit-submit-btn');
          if (submitBtn) submitBtn.click();
        }
      });

      this.feedGrid.appendChild(card);
    });
  }

  formatTimeAgo(timestamp) {
    if (!timestamp) return 'just now';
    const diffSec = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  }
}

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

  const statsManager = new StatsManager();
  window.statsManager = statsManager;

  // Wire Quick Audit Chips
  const quickChips = document.querySelectorAll('.quick-audit-chip[data-quick-repo]');
  quickChips.forEach((chip) => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const repoUrl = chip.getAttribute('data-quick-repo');
      if (!repoUrl) return;

      if (audio) audio.playHover();
      modals.openAuditModal();

      const input = document.querySelector('.connect-input');
      if (input) {
        input.value = repoUrl;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      setTimeout(() => {
        const submitBtn = document.querySelector('.audit-submit-btn');
        if (submitBtn) submitBtn.click();
      }, 300);
    });
  });

  // Custom Cursor
  const cursor = document.querySelector('.custom-cursor');
  if (cursor) {
    window.addEventListener('mousemove', (e) => {
      cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    });

    const interactiveElements = document.querySelectorAll('a, button, input, textarea, .topic-chip, .hotspot, .eye-hotspot-block, .blog-card, .quick-audit-chip, .live-recent-card');
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
    const utcHours = now.getUTCHours() + 1;
    const hours = String((utcHours + 24) % 24).padStart(2, '0');
    const minutes = String(now.getUTCMinutes()).padStart(2, '0');
    clockEl.innerText = `${hours}:${minutes} UTC+1`;
  };
  updateClock();
  setInterval(updateClock, 1000);
});
