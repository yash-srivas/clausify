/**
 * Multi-Theme & Light/Dark Mode Management System
 * Themes supported:
 * 1. claymorphism (Soft 3D & Bubbly, baseline)
 * 2. material-you (Google M3 Dynamic Tonal)
 * 3. neo-brutalism (Bold Black Borders & Hard Pop Shadows)
 * 4. neumorphism (Embossed Dual-Shadow Plastic)
 * 5. glassmorphism (Frosted Glass Acrylic & Ambient Mesh)
 * 6. monochrome (Minimalist Swiss Editorial)
 *
 * Each theme fully supports both Light Mode and Dark Mode.
 */

export const THEMES = [
  { id: 'claymorphism', name: 'Claymorphism', icon: 'bi-droplet-half', desc: 'Soft 3D & Bubbly', bg: '#6366F1' },
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

export function getCurrentMode() {
  if (typeof window === 'undefined') return 'light';
  const param = new URLSearchParams(window.location.search).get('mode');
  if (param === 'dark' || param === 'light') {
    localStorage.setItem('app_mode', param);
    return param;
  }
  return localStorage.getItem('app_mode') || 'light';
}

export function applyTheme(themeId) {
  if (!THEMES.some((t) => t.id === themeId)) {
    themeId = 'claymorphism';
  }
  document.documentElement.setAttribute('data-theme', themeId);
  localStorage.setItem('app_theme', themeId);

  // Sync select dropdown in user profile menu if present
  const userSelect = document.getElementById('userThemeSelect');
  if (userSelect && userSelect.value !== themeId) {
    userSelect.value = themeId;
  }

  // Sync login page theme label if present
  const loginThemeLabel = document.getElementById('loginCurrentThemeName');
  const active = THEMES.find((t) => t.id === themeId);
  if (loginThemeLabel && active) {
    loginThemeLabel.innerText = active.name;
  }

  // Sync any nav dropdown indicators
  document.querySelectorAll('.nav-theme-opt').forEach((btn) => {
    const isCur = btn.getAttribute('data-theme') === themeId;
    btn.classList.toggle('active', isCur);
  });

  // Dispatch custom event for charts or dynamic widgets
  window.dispatchEvent(new CustomEvent('themechanged', { detail: { theme: themeId, mode: getCurrentMode() } }));
}

export function applyMode(mode) {
  const normalized = mode === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-mode', normalized);
  document.documentElement.setAttribute('data-bs-theme', normalized);
  localStorage.setItem('app_mode', normalized);

  // Update navbar mode toggle icon
  const navModeIcon = document.getElementById('navModeIcon');
  if (navModeIcon) {
    if (normalized === 'dark') {
      navModeIcon.className = 'bi bi-sun';
    } else {
      navModeIcon.className = 'bi bi-moon-stars';
    }
  }

  const navModeToggleBtn = document.getElementById('navModeToggleBtn');
  if (navModeToggleBtn) {
    navModeToggleBtn.setAttribute(
      'title',
      normalized === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'
    );
  }

  // Update profile menu mode toggle text
  const menuModeText = document.getElementById('menuModeText');
  if (menuModeText) {
    menuModeText.innerText = normalized === 'dark' ? 'Light Mode' : 'Dark Mode';
  }

  // Update login page mode toggle
  const loginModeIcon = document.getElementById('loginModeIcon');
  const loginModeLabel = document.getElementById('loginModeLabel');
  if (loginModeIcon && loginModeLabel) {
    if (normalized === 'dark') {
      loginModeIcon.className = 'bi bi-sun';
      loginModeLabel.innerText = 'Light Mode';
    } else {
      loginModeIcon.className = 'bi bi-moon-stars';
      loginModeLabel.innerText = 'Dark Mode';
    }
  }

  // Dispatch custom event for charts or dynamic widgets
  window.dispatchEvent(new CustomEvent('modechanged', { detail: { mode: normalized, theme: getCurrentTheme() } }));
}

export function toggleMode() {
  const current = getCurrentMode();
  const next = current === 'dark' ? 'light' : 'dark';
  applyMode(next);
  return next;
}

export function initThemeSwitcher() {
  // Clean up any residual floating dock widget from past revisions
  document.querySelectorAll('.theme-switcher-dock, #themeSwitcherDock, .theme-popover-menu').forEach((el) => el.remove());

  // Apply current theme and mode
  const initialTheme = getCurrentTheme();
  const initialMode = getCurrentMode();

  applyTheme(initialTheme);
  applyMode(initialMode);
}

// Expose globally for inline or navbar handlers
if (typeof window !== 'undefined') {
  window.applyTheme = applyTheme;
  window.getCurrentTheme = getCurrentTheme;
  window.applyMode = applyMode;
  window.getCurrentMode = getCurrentMode;
  window.toggleMode = toggleMode;
  window.THEMES = THEMES;
}

// Auto-run on DOM load
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initThemeSwitcher());
  } else {
    initThemeSwitcher();
  }
}
