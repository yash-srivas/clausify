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

  const user = getUser() || { name: 'Guest', role: 'unknown' };
  const role = user.role;

  let linksHtml = '';

  // Associate Links
  const associateActive = activeKey === 'associate-dashboard' ? 'active' : '';
  linksHtml += `
    <li class="nav-item">
      <a class="nav-link ${associateActive}" href="/associate/dashboard.html">
        <i class="bi bi-file-earmark-text me-1"></i>Contracts
      </a>
    </li>
  `;

  // Partner Links
  if (role === 'partner' || role === 'admin') {
    const approvalsActive = activeKey === 'partner-approvals' ? 'active' : '';
    const templatesActive = activeKey === 'partner-templates' ? 'active' : '';
    linksHtml += `
      <li class="nav-item">
        <a class="nav-link ${approvalsActive}" href="/partner/approvals.html">
          <i class="bi bi-check2-circle me-1"></i>Approvals
        </a>
      </li>
      <li class="nav-item">
        <a class="nav-link ${templatesActive}" href="/partner/templates.html">
          <i class="bi bi-bookmark-check me-1"></i>Safe Templates
        </a>
      </li>
    `;
  }

  // Admin Links
  if (role === 'admin') {
    const analyticsActive = activeKey === 'admin-analytics' ? 'active' : '';
    const usersActive = activeKey === 'admin-users' ? 'active' : '';
    const auditActive = activeKey === 'admin-audit' ? 'active' : '';
    linksHtml += `
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
          <i class="bi bi-shield-check me-1"></i>Audit Logs
        </a>
      </li>
    `;
  }

  const roleBadgeClass =
    role === 'admin'
      ? 'badge-risk-high'
      : role === 'partner'
      ? 'badge-risk-medium'
      : 'badge-risk-low';

  const initial = user.name ? user.name.charAt(0).toUpperCase() : 'U';
  const curMode = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-mode')) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('app_mode')) || 'light';
  const isDark = curMode === 'dark';
  const modeIconClass = isDark ? 'bi-sun' : 'bi-moon-stars';
  const modeBtnTitle = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  const modeMenuLabel = isDark ? 'Light Mode' : 'Dark Mode';

  const navbarHtml = `
    <nav class="navbar navbar-expand-lg navbar-light navbar-custom">
      <div class="container-fluid px-2">
        <a class="navbar-brand d-flex align-items-center" href="${getDefaultRedirectForRole(role)}">
          <i class="bi bi-shield-shaded text-primary fs-4 me-2"></i>
          <span class="fw-bold">Legal Risk Analyzer</span>
        </a>
        <button class="navbar-toggler border-0" type="button" data-bs-toggle="collapse" data-bs-target="#navContent" aria-controls="navContent" aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse" id="navContent">
          <ul class="navbar-nav me-auto mb-2 mb-lg-0 gap-1">
            ${linksHtml}
          </ul>
          <div class="d-flex align-items-center gap-2">
            <!-- Subtle 1-Click Dark/Light Mode Icon Toggle -->
            <button id="navModeToggleBtn" class="btn btn-sm btn-nav-mode rounded-circle d-flex align-items-center justify-content-center" type="button" title="${modeBtnTitle}" aria-label="Toggle light or dark mode">
              <i class="bi ${modeIconClass}" id="navModeIcon"></i>
            </button>

            <!-- User Profile & Discreet Settings Dropdown -->
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
                <i class="bi bi-chevron-down ms-2 small text-muted" style="font-size: 0.75rem;"></i>
              </button>

              <ul class="dropdown-menu dropdown-menu-end shadow-lg rounded-4 p-2 user-menu-dropdown" aria-labelledby="userProfileDropdownBtn" style="min-width: 240px;">
                <!-- User Details -->
                <li class="px-3 py-2 border-bottom mb-2">
                  <div class="fw-bold text-dark user-menu-name">${user.name}</div>
                  <div class="small text-secondary user-menu-email">${user.email || user.name.toLowerCase().replace(/\s+/g, '') + '@demo.com'}</div>
                  <div class="mt-1"><span class="badge ${roleBadgeClass} text-uppercase" style="font-size: 0.65rem;">${user.role} Workspace</span></div>
                </li>

                <!-- Discreet Theme & Appearance Selection -->
                <li class="px-3 py-1">
                  <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="small fw-semibold text-muted text-uppercase" style="font-size: 0.68rem; letter-spacing: 0.5px;">Theme Style</span>
                    <button class="btn btn-xs btn-link text-decoration-none p-0 small text-primary" id="menuModeToggleBtn" type="button" style="font-size: 0.75rem;">
                      <span id="menuModeText">${modeMenuLabel}</span>
                    </button>
                  </div>
                  <select id="userThemeSelect" class="form-select form-select-sm rounded-3 mb-2" style="font-size: 0.82rem;">
                    <option value="claymorphism">Claymorphism</option>
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
                  <button id="logoutBtn" class="dropdown-item rounded-3 py-2 text-danger d-flex align-items-center">
                    <i class="bi bi-box-arrow-right me-2"></i>Sign Out
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;

  navPlaceholder.innerHTML = navbarHtml;

  // Clean up any residual floating dock widget from past revisions
  document.querySelectorAll('.theme-switcher-dock, #themeSwitcherDock, .theme-popover-menu').forEach((el) => el.remove());

  // Mode Toggle Handlers
  const navModeBtn = document.getElementById('navModeToggleBtn');
  if (navModeBtn) {
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
  if (menuModeBtn) {
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

  // Theme Select Handler
  const userThemeSelect = document.getElementById('userThemeSelect');
  const curTheme = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')) ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('app_theme')) || 'claymorphism';
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

