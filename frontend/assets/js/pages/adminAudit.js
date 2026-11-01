/**
 * Admin Audit Logs & Health Telemetry Controller
 */

import { api } from '../api.js';
import { requireAuth, renderNavbar } from '../auth.js';
import { showToast } from '../toast.js';

let currentPage = 1;
const limit = 20;
let totalPages = 1;

document.addEventListener('DOMContentLoaded', async () => {
  const admin = requireAuth(['admin']);
  if (!admin) return;

  renderNavbar('admin-audit');

  setupFilters();
  setupPagination();

  document.getElementById('refreshAuditBtn').addEventListener('click', () => {
    loadHealth();
    loadAuditLogs();
  });

  await loadHealth();
  await loadAuditLogs();
});

async function loadHealth() {
  const backendHealthText = document.getElementById('backendHealthText');
  const backendHealthBadge = document.getElementById('backendHealthBadge');
  const aiHealthText = document.getElementById('aiHealthText');
  const aiHealthBadge = document.getElementById('aiHealthBadge');
  const dbHealthText = document.getElementById('dbHealthText');
  const dbHealthBadge = document.getElementById('dbHealthBadge');

  try {
    const health = await api.get('/admin/health');

    // Backend
    backendHealthText.textContent = 'ONLINE (Port 3000)';
    backendHealthBadge.className = 'clay-icon-sphere success fs-4';

    // AI Service
    if (health.ai_service && health.ai_service.status === 'healthy') {
      aiHealthText.textContent = `ONLINE (${health.ai_service.providers ? health.ai_service.providers.embedding.toUpperCase() : 'MOCK'})`;
      aiHealthBadge.className = 'clay-icon-sphere success fs-4';
    } else {
      aiHealthText.textContent = 'OFFLINE / UNREACHABLE';
      aiHealthBadge.className = 'clay-icon-sphere warning fs-4';
    }

    // Database
    if (health.database && health.database.status === 'connected') {
      dbHealthText.textContent = `CONNECTED (pgvector ${health.database.pgvector ? 'OK' : 'N/A'})`;
      dbHealthBadge.className = 'clay-icon-sphere success fs-4';
    } else {
      dbHealthText.textContent = 'DISCONNECTED';
      dbHealthBadge.className = 'clay-icon-sphere danger fs-4';
    }
  } catch (err) {
    backendHealthText.textContent = 'ERROR';
    backendHealthBadge.className = 'clay-icon-sphere danger fs-4';
  }
}

async function loadAuditLogs() {
  const tbody = document.getElementById('auditTableBody');
  const entity = document.getElementById('entityFilterSelect').value;
  const action = document.getElementById('actionFilterInput').value.trim();

  try {
    const res = await api.get('/admin/audit-logs', {
      page: currentPage,
      limit,
      entity: entity || undefined,
      action: action || undefined,
    });

    const logs = res.logs || [];
    const pagination = res.pagination || { totalPages: 1, total: 0 };
    totalPages = pagination.totalPages || 1;

    updatePaginationUI(pagination);

    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">No audit logs found.</td></tr>';
      return;
    }

    tbody.innerHTML = logs
      .map((log) => {
        const timeStr = new Date(log.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const actionBadgeClass =
          log.action.startsWith('POST')
            ? 'badge bg-primary text-white'
            : log.action.startsWith('PATCH')
            ? 'badge bg-warning text-dark'
            : log.action.startsWith('PUT')
            ? 'badge bg-info text-dark'
            : 'badge bg-secondary text-white';

        return `
          <tr>
            <td class="small text-muted fw-medium text-nowrap">${timeStr}</td>
            <td>
              <div class="fw-bold text-dark fs-6">${log.user_name || 'System / Guest'}</div>
              <div class="text-muted small">${log.user_email || '--'}</div>
            </td>
            <td><span class="${actionBadgeClass} px-2 py-1">${log.action}</span></td>
            <td><span class="badge bg-white text-secondary border px-2 py-1 text-uppercase">${log.entity}</span></td>
            <td class="small font-monospace text-muted text-truncate" style="max-width: 140px;">
              ${log.entity_id || '--'}
            </td>
            <td class="small text-muted font-monospace">${log.ip || '127.0.0.1'}</td>
            <td class="text-end">
              <button class="btn btn-outline-secondary btn-sm px-3 py-1 inspect-btn" data-meta="${encodeURIComponent(JSON.stringify(log.metadata || {}, null, 2))}">
                <i class="bi bi-code-slash me-1"></i>Inspect
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.querySelectorAll('.inspect-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const meta = decodeURIComponent(btn.getAttribute('data-meta'));
        document.getElementById('metaContent').textContent = meta;
        new window.bootstrap.Modal(document.getElementById('metadataModal')).show();
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-danger small py-3 text-center">Failed to load audit logs: ${err.message}</td></tr>`;
  }
}

function setupFilters() {
  const entitySelect = document.getElementById('entityFilterSelect');
  const actionInput = document.getElementById('actionFilterInput');

  entitySelect.addEventListener('change', () => {
    currentPage = 1;
    loadAuditLogs();
  });

  let debounceTimer = null;
  actionInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentPage = 1;
      loadAuditLogs();
    }, 400);
  });
}

function setupPagination() {
  const prevBtn = document.getElementById('prevPageBtn');
  const nextBtn = document.getElementById('nextPageBtn');

  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadAuditLogs();
    }
  });

  nextBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      loadAuditLogs();
    }
  });
}

function updatePaginationUI(pagination) {
  document.getElementById('paginationLabel').textContent = `Page ${currentPage} of ${totalPages} (${pagination.total || 0} events)`;
  document.getElementById('prevPageBtn').disabled = currentPage <= 1;
  document.getElementById('nextPageBtn').disabled = currentPage >= totalPages;
}

