/**
 * RankOps — Section Navigation & Tick Ruler Manager
 */

class ScrollManager {
  constructor() {
    this.currentSection = 0;
    this.totalSections = 8;
    this.isScrolling = false;
    this.touchStartY = 0;
    this.accumulatedDelta = 0;
    this.threshold = 45;
    this.sectionTitles = [
      'SEO & AEO Auditor',
      'The Paradigm Shift',
      'Proposed Solution',
      'Audit Repository',
      'Technical Stack',
      'Impact & AI Search',
      'Audit to Approval',
      'Get Started'
    ];

    this.init();
  }

  init() {
    this.bindEvents();
    this.updateUI(0);
  }

  bindEvents() {
    window.addEventListener('wheel', (e) => {
      if (document.body.classList.contains('menu-open') || document.body.classList.contains('connect-open')) {
        return;
      }
      this.accumulatedDelta += e.deltaY;
      if (Math.abs(this.accumulatedDelta) >= this.threshold && !this.isScrolling) {
        if (this.accumulatedDelta > 0) {
          this.next();
        } else {
          this.prev();
        }
        this.accumulatedDelta = 0;
      }
      clearTimeout(this.wheelTimeout);
      this.wheelTimeout = setTimeout(() => {
        this.accumulatedDelta = 0;
      }, 180);
    }, { passive: true });

    window.addEventListener('touchstart', (e) => {
      this.touchStartY = e.touches[0].clientY;
    }, { passive: true });

    window.addEventListener('touchend', (e) => {
      if (document.body.classList.contains('menu-open') || document.body.classList.contains('connect-open')) {
        return;
      }
      const touchEndY = e.changedTouches[0].clientY;
      const diff = this.touchStartY - touchEndY;
      if (Math.abs(diff) > 35 && !this.isScrolling) {
        if (diff > 0) {
          this.next();
        } else {
          this.prev();
        }
      }
    }, { passive: true });

    window.addEventListener('keydown', (e) => {
      if (document.body.classList.contains('menu-open') || document.body.classList.contains('connect-open')) {
        if (e.key === 'Escape') {
          window.modals?.closeAll();
        }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        this.next();
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        this.prev();
      }
    });

    document.querySelectorAll('.page-indicators .tick, a[href^="#section-"], .menu-link-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const href = btn.getAttribute('href');
        let targetIndex = 0;
        if (href && href.startsWith('#section-')) {
          targetIndex = parseInt(href.replace('#section-', ''), 10);
        } else if (btn.dataset.sectionIndex !== undefined) {
          targetIndex = parseInt(btn.dataset.sectionIndex, 10);
        }
        if (!isNaN(targetIndex)) {
          this.goTo(targetIndex);
          if (window.modals) window.modals.closeMenu();
        }
      });
    });
  }

  next() {
    if (this.currentSection < this.totalSections - 1) {
      this.goTo(this.currentSection + 1);
    }
  }

  prev() {
    if (this.currentSection > 0) {
      this.goTo(this.currentSection - 1);
    }
  }

  goTo(index) {
    if (index === this.currentSection || index < 0 || index >= this.totalSections || this.isScrolling) return;
    this.isScrolling = true;
    this.currentSection = index;

    if (window.daoismAudio) {
      window.daoismAudio.playSection();
    }

    this.updateUI(index);

    setTimeout(() => {
      this.isScrolling = false;
    }, 450);
  }

  updateUI(index) {
    const sections = document.querySelectorAll('.section');
    sections.forEach((sec, idx) => {
      if (idx === index) {
        sec.style.display = 'flex';
        void sec.offsetWidth;
        sec.classList.add('active');
        sec.style.opacity = '1';
        sec.style.visibility = 'visible';
        sec.style.pointerEvents = 'auto';
      } else {
        sec.classList.remove('active');
        sec.style.opacity = '0';
        sec.style.visibility = 'hidden';
        sec.style.pointerEvents = 'none';
        setTimeout(() => {
          if (!sec.classList.contains('active')) {
            sec.style.display = 'none';
          }
        }, 300);
      }
    });

    // Update tick indicator ruler
    const ticks = document.querySelectorAll('.page-indicators .tick');
    ticks.forEach((tick, i) => {
      const secIdx = Math.floor(i / 4);
      if (secIdx === index && i % 4 === 0) {
        tick.classList.add('active');
      } else {
        tick.classList.remove('active');
      }
    });

    // Update red slider bar position
    const wrap = document.querySelector('.scroll-indicator__wrap');
    if (wrap) {
      const progress = index / (this.totalSections - 1);
      wrap.style.setProperty('--scroll-progress', `${progress * 100}%`);
    }

    // Update bottom-left indicator pill
    const statusPill = document.querySelector('.current-section-indicator');
    if (statusPill) {
      const padNum = String(index).padStart(2, '0');
      const title = this.sectionTitles[index] || '';
      statusPill.innerHTML = `${padNum} <svg width="6" height="6" viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg"><rect y="2.82837" width="4" height="4" transform="rotate(-45 0 2.82837)" fill="#FF4E3E"></rect></svg> ${title}`;
    }

    // Update 3D scene progress
    if (window.scene3d) {
      window.scene3d.setScrollProgress(index / (this.totalSections - 1));
    }
  }
}

window.ScrollManager = ScrollManager;
