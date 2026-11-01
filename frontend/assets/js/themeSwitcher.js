/**
 * Multi-Theme Management & Interactive Theme Switcher Module
 * Themes supported:
 * 1. claymorphism (Default)
 * 2. material-you (Google M3)
 * 3. neo-brutalism (Bold Black Borders & Hard Pop Shadows)
 * 4. neumorphism (Soft Embossed Dual-Shadow Plastic)
 * 5. glassmorphism (Frosted Glass Acrylic & Ambient Mesh)
 * 6. monochrome (Minimalist Swiss Editorial)
 */

export const THEMES = [
  { id: 'claymorphism', name: 'Claymorphism', icon: 'bi-droplet-half', desc: 'Soft 3D & Bubbly (Default)', bg: '#6366F1' },
  { id: 'material-you', name: 'Material You', icon: 'bi-palette2', desc: 'Google M3 Dynamic Tonal', bg: '#6750A4' },
  { id: 'neo-brutalism', name: 'Neo-Brutalism', icon: 'bi-square-fill', desc: 'Bold Borders & Pop Shadows', bg: '#FFE600' },
  { id: 'neumorphism', name: 'Neumorphism', icon: 'bi-circle-half', desc: 'Embossed Dual-Shadow Plastic', bg: '#E0E5EC' },
  { id: 'glassmorphism', name: 'Glassmorphism', icon: 'bi-gem', desc: 'Frosted Glass & Ambient Mesh', bg: '#818CF8' },
  { id: 'monochrome', name: 'Monochrome', icon: 'bi-circle-fill', desc: 'Minimalist Swiss Editorial', bg: '#09090B' },
];

export function getCurrentTheme() {
  if (typeof window === 'undefined') return 'claymorphism';
  const param = new URLSearchParams(window.location.search).get('theme');
  if (param && THEMES.some((t) => t.id === param)) {
    localStorage.setItem('app_theme', param);
    return param;
  }
  return localStorage.getItem('app_theme') || 'claymorphism';
}

export function applyTheme(themeId) {
  if (!THEMES.some((t) => t.id === themeId)) {
    themeId = 'claymorphism';
  }
  document.documentElement.setAttribute('data-theme', themeId);
  localStorage.setItem('app_theme', themeId);

  // Update switcher trigger text if present
  const triggerLabel = document.getElementById('themeCurrentLabel');
  const active = THEMES.find((t) => t.id === themeId);
  if (triggerLabel && active) {
    triggerLabel.innerHTML = `<i class="bi ${active.icon} me-1"></i> <span class="d-none d-sm-inline">${active.name}</span>`;
  }

  // Update navbar theme text if present
  const navCurrent = document.getElementById('navThemeCurrent');
  if (navCurrent && active) {
    navCurrent.innerText = active.name;
  }

  // Update active checkmarks in menu
  document.querySelectorAll('.theme-option-item').forEach((item) => {
    const isCur = item.getAttribute('data-theme-id') === themeId;
    item.classList.toggle('active', isCur);
    const check = item.querySelector('.theme-check-icon');
    if (check) check.classList.toggle('d-none', !isCur);
  });

  // Update active status in navbar dropdown
  document.querySelectorAll('.nav-theme-opt').forEach((btn) => {
    const isCur = btn.getAttribute('data-theme') === themeId;
    btn.classList.toggle('active', isCur);
  });

  // Dispatch custom event for charts or widgets to adapt
  window.dispatchEvent(new CustomEvent('themechanged', { detail: { theme: themeId } }));
}

export function initThemeSwitcher() {
  // Apply saved theme immediately
  const initialTheme = getCurrentTheme();
  applyTheme(initialTheme);

  // If a navbar is present or intended for this page, the top navbar contains
  // the theme dropdown. To avoid duplicate controls and prevent overlapping page inputs
  // (such as search boxes and action buttons), do not render the floating dock on navbar pages.
  const hasNavbar = !!document.getElementById('navbarPlaceholder');
  if (hasNavbar) {
    const existing = document.getElementById('themeSwitcherDock');
    if (existing) existing.remove();
    return;
  }

  // Render floating switcher dock if not already in DOM (e.g. login.html)
  if (!document.getElementById('themeSwitcherDock')) {
    const dock = document.createElement('div');
    dock.id = 'themeSwitcherDock';
    dock.className = 'theme-switcher-dock';

    const activeTheme = THEMES.find((t) => t.id === initialTheme) || THEMES[0];

    dock.innerHTML = `
      <div class="position-relative">
        <button id="themeTriggerBtn" class="theme-trigger-btn" type="button" title="Switch UI Theme">
          <span id="themeCurrentLabel"><i class="bi ${activeTheme.icon} me-1"></i> <span class="d-none d-sm-inline">${activeTheme.name}</span></span>
          <i class="bi bi-palette ms-1"></i>
        </button>

        <div id="themePopoverMenu" class="theme-popover-menu">
          <div class="px-2 py-1 border-bottom mb-1 d-flex justify-content-between align-items-center">
            <span class="small fw-bold text-dark text-uppercase" style="font-size: 0.72rem; letter-spacing: 0.5px;">Choose Theme</span>
            <span class="badge bg-light text-secondary border" style="font-size: 0.65rem;">6 Available</span>
          </div>

          ${THEMES.map(
            (t) => `
            <button class="theme-option-item ${t.id === initialTheme ? 'active' : ''}" data-theme-id="${t.id}" type="button">
              <div class="theme-swatch shadow-xs" style="background: ${t.bg}; color: ${t.id === 'neo-brutalism' ? '#000' : '#fff'};">
                <i class="bi ${t.icon}" style="font-size: 0.85rem;"></i>
              </div>
              <div class="theme-option-info">
                <div class="theme-option-name">${t.name}</div>
                <div class="theme-option-desc">${t.desc}</div>
              </div>
              <i class="bi bi-check-lg theme-check-icon text-primary ${t.id === initialTheme ? '' : 'd-none'}"></i>
            </button>
          `
          ).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(dock);

    // Event listeners
    const trigger = document.getElementById('themeTriggerBtn');
    const menu = document.getElementById('themePopoverMenu');

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!dock.contains(e.target)) {
        menu.classList.remove('show');
      }
    });

    dock.querySelectorAll('.theme-option-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const selectedId = btn.getAttribute('data-theme-id');
        applyTheme(selectedId);
        menu.classList.remove('show');
      });
    });
  }
}

// Expose globally for inline/navbar handlers
if (typeof window !== 'undefined') {
  window.applyTheme = applyTheme;
  window.getCurrentTheme = getCurrentTheme;
}

// Auto-run on DOM load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initThemeSwitcher());
  } else {
    initThemeSwitcher();
  }
}
