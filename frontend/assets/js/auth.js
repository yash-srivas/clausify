/**
 * Auth Module - Role-based access control, token management, and dynamic navbar
 */

export function getToken() {
  if (typeof window !== 'undefined') {
    const urlParam = new URLSearchParams(window.location.search).get('token');
    if (urlParam) {
      localStorage.setItem('token', urlParam);
      return urlParam;
    }
  }
  return localStorage.getItem('token');
}

export function setToken(token) {
  localStorage.setItem('token', token);
}

export function getUser() {
  if (typeof window !== 'undefined') {
    const userParam = new URLSearchParams(window.location.search).get('user');
    if (userParam) {
      try {
        const u = JSON.parse(decodeURIComponent(userParam));
        localStorage.setItem('user', JSON.stringify(u));
        return u;
      } catch {}
    }
  }
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

export function setUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function isLoggedIn() {
  return !!getToken() && !!getUser();
}

export function logout() {
  clearAuth();
  window.location.href = '/login.html';
}

export function getDefaultRedirectForRole(role) {
  switch (role) {
    case 'partner':
      return '/partner/approvals.html';
    case 'admin':
      return '/admin/analytics.html';
    case 'associate':
    default:
      return '/associate/dashboard.html';
  }
}

export function requireAuth(allowedRoles = []) {
  if (!isLoggedIn()) {
    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?returnUrl=${returnUrl}`;
    return null;
  }

  const user = getUser();
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    // Redirect to permitted default for their role
    window.location.href = getDefaultRedirectForRole(user.role);
    return null;
  }

  return user;
}

export function renderNavbar(activeKey = '') {
  const navPlaceholder = document.getElementById('navbarPlaceholder');
  if (!navPlaceholder) return;

  const authenticated = isLoggedIn();
  const user = authenticated ? getUser() : null;
  const role = user ? user.role : 'guest';

  const curMode = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-mode')) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('app_mode')) || 'light';
  const isDark = curMode === 'dark';
  const modeIconClass = isDark ? 'bi-sun' : 'bi-moon-stars';
  const modeBtnTitle = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  const modeMenuLabel = isDark ? 'Light Mode' : 'Dark Mode';

  const curTheme = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('app_theme')) || 'claymorphism';

  const themeNames = {
    'claymorphism': 'Claymorphism',
    'material-you': 'Material You',
    'neo-brutalism': 'Neo-Brutalism',
    'neumorphism': 'Neumorphism',
    'glassmorphism': 'Glassmorphism',
    'monochrome': 'Monochrome'
  };
  const curThemeLabel = themeNames[curTheme] || 'Claymorphism';

  let navbarContentHtml = '';

  if (authenticated && user) {
    // Authenticated User Experience (Associate, Partner, Admin)
    const roleBadgeClass =
      role === 'admin'
        ? 'badge-risk-high'
        : role === 'partner'
        ? 'badge-risk-medium'
        : 'badge-risk-low';

    const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';

    // Workspace links based on role
    const mattersActive = activeKey === 'associate-dashboard' || activeKey === 'associate-review' || activeKey === 'matters' ? 'active' : '';
    let workspaceLinksHtml = `
      <li class="nav-item">
        <a class="nav-link ${mattersActive}" href="/associate/dashboard.html">
          <i class="bi bi-file-earmark-text me-1"></i>Matters
        </a>
      </li>
    `;

    if (role === 'partner' || role === 'admin') {
      const approvalsActive = activeKey === 'partner-approvals' || activeKey === 'approvals' ? 'active' : '';
      const templatesActive = activeKey === 'partner-templates' || activeKey === 'templates' ? 'active' : '';
      workspaceLinksHtml += `
        <li class="nav-item">
          <a class="nav-link ${approvalsActive}" href="/partner/approvals.html">
            <i class="bi bi-check2-circle me-1"></i>Approvals
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link ${templatesActive}" href="/partner/templates.html">
            <i class="bi bi-bookmark-check me-1"></i>Playbooks
          </a>
        </li>
      `;
    }

    if (role === 'admin') {
      const analyticsActive = activeKey === 'admin-analytics' || activeKey === 'analytics' ? 'active' : '';
      const usersActive = activeKey === 'admin-users' || activeKey === 'users' ? 'active' : '';
      const auditActive = activeKey === 'admin-audit' || activeKey === 'audit' ? 'active' : '';
      workspaceLinksHtml += `
        <li class="nav-item">
          <a class="nav-link ${analyticsActive}" href="/admin/analytics.html">
            <i class="bi bi-graph-up me-1"></i>Analytics
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link ${usersActive}" href="/admin/users.html">
            <i class="bi bi-people me-1"></i>Users
          </a>
        </li>
        <li class="nav-item">
          <a class="nav-link ${auditActive}" href="/admin/audit.html">
            <i class="bi bi-shield-check me-1"></i>Audit Trail
          </a>
        </li>
      `;
    }

    const platformActive = activeKey.startsWith('public-') ? 'active' : '';

    navbarContentHtml = `
      <div class="collapse navbar-collapse" id="siteNavContent">
        <ul class="navbar-nav me-auto mb-2 mb-lg-0 gap-1 ps-lg-2">
          <!-- Platform Menu Dropdown for Power Users -->
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle ${platformActive}" href="#" id="platformDropdown" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-grid-fill me-1 opacity-75"></i>Platform
            </a>
            <ul class="dropdown-menu shadow-lg rounded-3 p-2" aria-labelledby="platformDropdown" style="min-width: 220px;">
              <li><h6 class="dropdown-header small text-uppercase fw-bold text-muted px-3 py-1" style="font-size: 0.65rem;">Platform Exploration</h6></li>
              <li><a class="dropdown-item rounded-2 py-1.5 small ${activeKey === 'public-platform' ? 'active' : ''}" href="/"><i class="bi bi-house me-2 text-primary"></i>Overview</a></li>
              <li><a class="dropdown-item rounded-2 py-1.5 small ${activeKey === 'public-solutions' ? 'active' : ''}" href="/solutions.html"><i class="bi bi-diagram-3 me-2 text-success"></i>Solutions Matrix</a></li>
              <li><a class="dropdown-item rounded-2 py-1.5 small ${activeKey === 'public-standards' ? 'active' : ''}" href="/benchmarks.html"><i class="bi bi-book me-2 text-info"></i>Statutory Standards</a></li>
              <li><a class="dropdown-item rounded-2 py-1.5 small ${activeKey === 'public-trust' ? 'active' : ''}" href="/security.html"><i class="bi bi-shield-check me-2 text-warning"></i>Trust & Security</a></li>
              <li><a class="dropdown-item rounded-2 py-1.5 small ${activeKey === 'public-sandbox' ? 'active' : ''}" href="/demo.html"><i class="bi bi-sliders me-2 text-warning"></i>Redline Sandbox</a></li>
            </ul>
          </li>

          <!-- Workspace Navigation Divider -->
          <li class="nav-item d-none d-lg-flex align-items-center px-1">
            <span class="nav-divider opacity-40">|</span>
          </li>

          <!-- Role-Based Workspace Core Tabs -->
          ${workspaceLinksHtml}
        </ul>

        <div class="d-flex align-items-center gap-2">
          <!-- Interactive Sandbox Fast Pill -->
          <a href="/demo.html" class="btn btn-xs btn-outline-warning rounded-pill px-2.5 py-1 fw-semibold d-none d-sm-inline-flex align-items-center gap-1" title="Interactive Statutory Sandbox" style="font-size: 0.75rem;">
            <i class="bi bi-play-circle"></i> Sandbox
          </a>

          <!-- Theme Preset Dropdown (Unified across all users) -->
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1 d-flex align-items-center gap-1" id="navThemeDropdownBtn" data-bs-toggle="dropdown" aria-expanded="false" type="button" style="font-size: 0.75rem;">
              <i class="bi bi-palette2"></i>
              <span class="d-none d-md-inline small fw-semibold nav-theme-current-label">${curThemeLabel}</span>
              <i class="bi bi-chevron-down small" style="font-size: 0.65rem;"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-lg rounded-3 p-2" aria-labelledby="navThemeDropdownBtn" style="min-width: 220px;">
              <li><h6 class="dropdown-header small text-uppercase fw-bold text-muted px-3 py-1" style="font-size: 0.65rem;">Theme Preset</h6></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'claymorphism' ? 'active' : ''}" data-theme="claymorphism"><i class="bi bi-droplet-half me-2"></i>Claymorphism</button></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'material-you' ? 'active' : ''}" data-theme="material-you"><i class="bi bi-palette2 me-2"></i>Material You</button></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'neo-brutalism' ? 'active' : ''}" data-theme="neo-brutalism"><i class="bi bi-square-fill me-2"></i>Neo-Brutalism</button></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'neumorphism' ? 'active' : ''}" data-theme="neumorphism"><i class="bi bi-circle-half me-2"></i>Neumorphism</button></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'glassmorphism' ? 'active' : ''}" data-theme="glassmorphism"><i class="bi bi-gem me-2"></i>Glassmorphism</button></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'monochrome' ? 'active' : ''}" data-theme="monochrome"><i class="bi bi-circle-fill me-2"></i>Monochrome</button></li>
            </ul>
          </div>

          <!-- Fast Mode Toggle -->
          <button id="navModeToggleBtn" class="btn btn-sm btn-nav-mode rounded-circle d-flex align-items-center justify-content-center" type="button" title="${modeBtnTitle}" aria-label="Toggle light or dark mode">
            <i class="bi ${modeIconClass}" id="navModeIcon"></i>
          </button>

          <!-- User Profile & Workspace Settings Dropdown -->
          <div class="dropdown">
            <button class="user-profile-pill d-flex align-items-center border-0 px-3 py-1 rounded-pill" id="userProfileDropdownBtn" data-bs-toggle="dropdown" aria-expanded="false" type="button">
              <div class="user-avatar-circle rounded-circle d-flex align-items-center justify-content-center text-white fw-bold me-2" style="width: 28px; height: 28px; font-size: 0.8rem;">
                ${initial}
              </div>
              <span class="user-name-text fw-semibold small me-2 d-none d-md-inline">
                ${user.name}
              </span>
              <span class="badge ${roleBadgeClass} text-uppercase px-2 py-0" style="font-size: 0.65rem;">
                ${user.role}
              </span>
              <i class="bi bi-chevron-down ms-2 small" style="font-size: 0.75rem;"></i>
            </button>

            <ul class="dropdown-menu dropdown-menu-end shadow-lg rounded-3 p-2 user-menu-dropdown" aria-labelledby="userProfileDropdownBtn" style="min-width: 260px;">
              <!-- User Details -->
              <li class="px-3 py-2 border-bottom mb-2">
                <div class="fw-bold text-dark user-menu-name">${user.name}</div>
                <div class="small text-secondary user-menu-email">${user.email || user.name.toLowerCase().replace(/\s+/g, '') + '@demo.com'}</div>
                <div class="mt-1"><span class="badge ${roleBadgeClass} text-uppercase" style="font-size: 0.65rem;">${user.role} Workspace</span></div>
              </li>

              <!-- Quick Workspace Links -->
              <li class="px-2 py-1">
                <span class="small fw-semibold text-muted text-uppercase px-2" style="font-size: 0.68rem; letter-spacing: 0.5px;">Workspace Nav</span>
                <a class="dropdown-item rounded-2 py-1.5 small" href="/associate/dashboard.html"><i class="bi bi-file-earmark-text me-2"></i>Contract Matters</a>
                <a class="dropdown-item rounded-2 py-1.5 small" href="/partner/approvals.html"><i class="bi bi-check2-circle me-2"></i>Executive Approvals</a>
                <a class="dropdown-item rounded-2 py-1.5 small" href="/partner/templates.html"><i class="bi bi-bookmark-check me-2"></i>Benchmark Playbooks</a>
                <a class="dropdown-item rounded-2 py-1.5 small" href="/admin/analytics.html"><i class="bi bi-graph-up me-2"></i>Risk Telemetry</a>
              </li>

              <li><hr class="dropdown-divider my-1"></li>

              <!-- Theme Selection -->
              <li class="px-3 py-1">
                <div class="d-flex align-items-center justify-content-between mb-2">
                  <span class="small fw-semibold text-muted text-uppercase" style="font-size: 0.68rem; letter-spacing: 0.5px;">Theme Preset</span>
                  <button class="btn btn-xs btn-link text-decoration-none p-0 small text-primary" id="menuModeToggleBtn" type="button" style="font-size: 0.75rem;">
                    <span id="menuModeText">${modeMenuLabel}</span>
                  </button>
                </div>
                <select id="userThemeSelect" class="form-select form-select-sm rounded-2 mb-2" style="font-size: 0.8rem;">
                  <option value="claymorphism">Claymorphism (Default)</option>
                  <option value="material-you">Material You</option>
                  <option value="neo-brutalism">Neo-Brutalism</option>
                  <option value="neumorphism">Neumorphism</option>
                  <option value="glassmorphism">Glassmorphism</option>
                  <option value="monochrome">Monochrome</option>
                </select>
              </li>

              <li><hr class="dropdown-divider my-1"></li>

              <!-- Sign Out -->
              <li>
                <button id="logoutBtn" class="dropdown-item rounded-2 py-2 text-danger d-flex align-items-center">
                  <i class="bi bi-box-arrow-right me-2"></i>Sign Out
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    `;
  } else {
    // Guest / Public Visitor Experience
    navbarContentHtml = `
      <div class="collapse navbar-collapse" id="siteNavContent">
        <ul class="navbar-nav mx-auto mb-2 mb-lg-0 gap-1">
          <li class="nav-item">
            <a class="nav-link ${activeKey === 'public-platform' ? 'active' : ''}" href="/">Platform</a>
          </li>
          <li class="nav-item">
            <a class="nav-link ${activeKey === 'public-solutions' ? 'active' : ''}" href="/solutions.html">Solutions</a>
          </li>
          <li class="nav-item">
            <a class="nav-link ${activeKey === 'public-standards' ? 'active' : ''}" href="/benchmarks.html">Standards</a>
          </li>
          <li class="nav-item">
            <a class="nav-link ${activeKey === 'public-trust' ? 'active' : ''}" href="/security.html">Trust</a>
          </li>
          <li class="nav-item">
            <a class="nav-link text-warning ${activeKey === 'public-sandbox' ? 'active' : ''}" href="/demo.html">
              <i class="bi bi-play-circle me-1"></i>Sandbox
            </a>
          </li>
        </ul>

        <div class="d-flex align-items-center gap-2">
          <!-- Fast Mode Toggle -->
          <button id="navModeToggleBtn" class="btn btn-sm btn-nav-mode rounded-circle d-flex align-items-center justify-content-center" type="button" title="${modeBtnTitle}" aria-label="Toggle light or dark mode">
            <i class="bi ${modeIconClass}" id="navModeIcon"></i>
          </button>

          <!-- Theme Preset Dropdown (For guests to test all 6 themes!) -->
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary rounded-pill px-2.5 py-1 d-flex align-items-center gap-1" id="guestThemeDropdownBtn" data-bs-toggle="dropdown" aria-expanded="false" type="button" style="font-size: 0.75rem;">
              <i class="bi bi-palette2"></i>
              <span class="d-none d-md-inline small fw-semibold nav-theme-current-label" id="guestThemeLabel">${curThemeLabel}</span>
              <i class="bi bi-chevron-down small" style="font-size: 0.65rem;"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-lg rounded-3 p-2" aria-labelledby="guestThemeDropdownBtn" style="min-width: 220px;">
              <li><h6 class="dropdown-header small text-uppercase fw-bold text-muted px-3 py-1" style="font-size: 0.65rem;">Theme Preset</h6></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'claymorphism' ? 'active' : ''}" data-theme="claymorphism"><i class="bi bi-droplet-half me-2"></i>Claymorphism</button></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'material-you' ? 'active' : ''}" data-theme="material-you"><i class="bi bi-palette2 me-2"></i>Material You</button></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'neo-brutalism' ? 'active' : ''}" data-theme="neo-brutalism"><i class="bi bi-square-fill me-2"></i>Neo-Brutalism</button></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'neumorphism' ? 'active' : ''}" data-theme="neumorphism"><i class="bi bi-circle-half me-2"></i>Neumorphism</button></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'glassmorphism' ? 'active' : ''}" data-theme="glassmorphism"><i class="bi bi-gem me-2"></i>Glassmorphism</button></li>
              <li><button class="dropdown-item rounded-2 py-1.5 small nav-theme-opt ${curTheme === 'monochrome' ? 'active' : ''}" data-theme="monochrome"><i class="bi bi-circle-fill me-2"></i>Monochrome</button></li>
            </ul>
          </div>

          <a href="/login.html" class="btn btn-sm btn-nav-auth px-3 py-1.5 fw-semibold" id="navAuthBtn">Sign In</a>
          <a href="/associate/dashboard.html" class="btn btn-sm btn-primary px-3.5 py-1.5 fw-bold shadow-sm" id="navWorkspaceBtn">
            Launch Workspace <i class="bi bi-arrow-right ms-1"></i>
          </a>
        </div>
      </div>
    `;
  }

  const brandLink = authenticated && user ? getDefaultRedirectForRole(role) : '/';

  const navbarHtml = `
    <nav class="navbar navbar-expand-xl site-navbar navbar-custom sticky-top">
      <div class="container-fluid px-3 px-xl-4 site-navbar-container">
        <a class="navbar-brand d-flex align-items-center gap-2" href="${brandLink}">
          <span class="brand-badge">C</span>
          <div class="d-flex flex-column">
            <span class="fw-bold fs-6 tracking-tight brand-title line-height-1">CLAUSIFY</span>
            <span class="brand-subtitle small text-uppercase" style="font-size: 0.6rem; letter-spacing: 0.08em;">Legal Risk Intelligence</span>
          </div>
        </a>
        <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#siteNavContent" aria-controls="siteNavContent" aria-expanded="false" aria-label="Toggle navigation">
          <i class="bi bi-list fs-3"></i>
        </button>
        ${navbarContentHtml}
      </div>
    </nav>
  `;

  navPlaceholder.innerHTML = navbarHtml;

  // Clean up any residual floating dock widget from past revisions
  document.querySelectorAll('.theme-switcher-dock, #themeSwitcherDock, .theme-popover-menu').forEach((el) => el.remove());

  // Bind Mode Toggle Handlers
  const navModeBtn = document.getElementById('navModeToggleBtn');
  if (navModeBtn && !navModeBtn.dataset.bound) {
    navModeBtn.dataset.bound = 'true';
    navModeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.toggleMode) {
        window.toggleMode();
      } else {
        const next = document.documentElement.getAttribute('data-mode') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-mode', next);
        document.documentElement.setAttribute('data-bs-theme', next);
        localStorage.setItem('app_mode', next);
      }
    });
  }

  const menuModeBtn = document.getElementById('menuModeToggleBtn');
  if (menuModeBtn && !menuModeBtn.dataset.bound) {
    menuModeBtn.dataset.bound = 'true';
    menuModeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.toggleMode) {
        window.toggleMode();
      } else {
        const next = document.documentElement.getAttribute('data-mode') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-mode', next);
        document.documentElement.setAttribute('data-bs-theme', next);
        localStorage.setItem('app_mode', next);
      }
    });
  }

  // Theme Select Handler (Authenticated)
  const userThemeSelect = document.getElementById('userThemeSelect');
  if (userThemeSelect) {
    userThemeSelect.value = curTheme;
    userThemeSelect.addEventListener('change', (e) => {
      const selected = e.target.value;
      if (window.applyTheme) {
        window.applyTheme(selected);
      } else {
        document.documentElement.setAttribute('data-theme', selected);
        localStorage.setItem('app_theme', selected);
      }
    });
  }

  // Theme Option Buttons
  document.querySelectorAll('.nav-theme-opt').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const selected = btn.getAttribute('data-theme');
      if (selected) {
        if (window.applyTheme) {
          window.applyTheme(selected);
        } else {
          document.documentElement.setAttribute('data-theme', selected);
          localStorage.setItem('app_theme', selected);
          const tName = themeNames[selected] || selected;
          document.querySelectorAll('.nav-theme-current-label, #guestThemeLabel').forEach((el) => {
            el.innerText = tName;
          });
          document.querySelectorAll('.nav-theme-opt').forEach((opt) => {
            opt.classList.toggle('active', opt.getAttribute('data-theme') === selected);
          });
        }
      }
    });
  });

  // Logout Handler
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  // Diagnostic or verification auto-open
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('opendropdown') === 'true') {
    setTimeout(() => {
      const btn = document.getElementById('userProfileDropdownBtn');
      if (btn && window.bootstrap) {
        const dd = new window.bootstrap.Dropdown(btn);
        dd.show();
      }
    }, 300);
  }
}

export default {
  getToken,
  setToken,
  getUser,
  setUser,
  clearAuth,
  isLoggedIn,
  logout,
  requireAuth,
  renderNavbar,
};

