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
            <!-- Theme Dropdown -->
            <div class="dropdown">
              <button class="btn btn-outline-secondary btn-sm rounded-pill px-3 py-1 dropdown-toggle d-flex align-items-center gap-1" type="button" id="navThemeDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                <i class="bi bi-palette"></i>
                <span class="d-none d-sm-inline" id="navThemeCurrent">Theme</span>
              </button>
              <ul class="dropdown-menu dropdown-menu-end shadow-sm rounded-4 p-2" aria-labelledby="navThemeDropdown" style="min-width: 200px;">
                <li><button class="dropdown-item rounded-3 py-2 nav-theme-opt" data-theme="claymorphism">Claymorphism</button></li>
                <li><button class="dropdown-item rounded-3 py-2 nav-theme-opt" data-theme="material-you">Material You</button></li>
                <li><button class="dropdown-item rounded-3 py-2 nav-theme-opt" data-theme="neo-brutalism">Neo-Brutalism</button></li>
                <li><button class="dropdown-item rounded-3 py-2 nav-theme-opt" data-theme="neumorphism">Neumorphism</button></li>
                <li><button class="dropdown-item rounded-3 py-2 nav-theme-opt" data-theme="glassmorphism">Glassmorphism</button></li>
                <li><button class="dropdown-item rounded-3 py-2 nav-theme-opt" data-theme="monochrome">Monochrome</button></li>
              </ul>
            </div>

            <div class="user-profile-pill d-flex align-items-center px-3 py-1 rounded-pill">
              <div class="user-avatar-circle rounded-circle d-flex align-items-center justify-content-center text-white fw-bold me-2" style="width: 28px; height: 28px; font-size: 0.8rem;">
                ${initial}
              </div>
              <span class="user-name-text fw-semibold small me-2 d-none d-md-inline">
                ${user.name}
              </span>
              <span class="badge ${roleBadgeClass} text-uppercase px-2 py-1" style="font-size: 0.68rem;">
                ${user.role}
              </span>
            </div>
            <button id="logoutBtn" class="btn btn-outline-secondary btn-sm rounded-pill px-3 py-1">
              <i class="bi bi-box-arrow-right me-1"></i>Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  `;

  navPlaceholder.innerHTML = navbarHtml;

  // Remove redundant floating dock if present to ensure clean layout with zero input overlap
  const dock = document.getElementById('themeSwitcherDock');
  if (dock) dock.remove();

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

  // Nav Theme Dropdown Listeners
  document.querySelectorAll('.nav-theme-opt').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const themeId = btn.getAttribute('data-theme');
      if (window.applyTheme) {
        window.applyTheme(themeId);
      } else {
        document.documentElement.setAttribute('data-theme', themeId);
        localStorage.setItem('app_theme', themeId);
      }
    });
  });

  // Sync nav theme label with active theme
  const curTheme = document.documentElement.getAttribute('data-theme') || localStorage.getItem('app_theme') || 'claymorphism';
  const navCur = document.getElementById('navThemeCurrent');
  if (navCur) {
    const names = {
      'claymorphism': 'Claymorphism',
      'material-you': 'Material You',
      'neo-brutalism': 'Neo-Brutalism',
      'neumorphism': 'Neumorphism',
      'glassmorphism': 'Glassmorphism',
      'monochrome': 'Monochrome',
    };
    if (names[curTheme]) navCur.innerText = names[curTheme];
  }

  document.querySelectorAll('.nav-theme-opt').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-theme') === curTheme);
  });

  // Auto-open dropdown if requested via query parameter (for verification / screenshots)
  if (new URLSearchParams(window.location.search).get('openTheme') === '1') {
    setTimeout(() => {
      const ddBtn = document.getElementById('navThemeDropdown');
      if (ddBtn && typeof bootstrap !== 'undefined' && bootstrap.Dropdown) {
        bootstrap.Dropdown.getOrCreateInstance(ddBtn).show();
      }
    }, 500);
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

