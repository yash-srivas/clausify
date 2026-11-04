/**
 * Partner Approvals Queue Controller
 */

import { api } from '../api.js';
import { requireAuth, renderNavbar } from '../auth.js';
import { showToast } from '../toast.js';

let contracts = [];
let activeStatusFilter = 'escalated';
let activeContractForDecision = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth(['partner', 'admin']);
  if (!user) return;

  renderNavbar('partner-approvals');

  setupFilterTabs();
  setupDecisionButtons();

  document.getElementById('refreshQueueBtn').addEventListener('click', () => loadContracts());

  await loadContracts();
});

function setupFilterTabs() {
  const pills = document.querySelectorAll('.filter-pill');
  pills.forEach((pill) => {
    pill.addEventListener('click', () => {
      pills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      activeStatusFilter = pill.getAttribute('data-status');
      renderTable();
    });
  });
}

async function loadContracts() {
  try {
    const res = await api.get('/contracts');
    contracts = Array.isArray(res) ? res : (res.contracts || []);

    const escalated = contracts.filter((c) => c.status === 'escalated');
    document.getElementById('escalatedCount').textContent = escalated.length;

    renderTable();
  } catch (err) {
    showToast('Failed to load contracts: ' + err.message, 'danger');
  }
}

function renderTable() {
  const tbody = document.getElementById('approvalsTableBody');

  let filtered = contracts;
  if (activeStatusFilter !== 'all') {
    filtered = filtered.filter((c) => c.status === activeStatusFilter);
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-4 d-block mb-1"></i>
          No contracts found in '${activeStatusFilter}' queue.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((c) => {
      let riskClass = 'badge-risk-low';
      let band = 'LOW RISK';
      if (c.overall_risk_score >= 67) {
        riskClass = 'badge-risk-high';
        band = 'HIGH RISK';
      } else if (c.overall_risk_score >= 34) {
        riskClass = 'badge-risk-medium';
        band = 'MEDIUM RISK';
      }

      const statusBadge =
        c.status === 'escalated'
          ? '<span class="clay-badge clay-badge-escalated"><i class="bi bi-exclamation-octagon"></i> ESCALATED</span>'
          : c.status === 'approved'
          ? '<span class="clay-badge clay-badge-approved"><i class="bi bi-check-circle-fill"></i> APPROVED</span>'
          : c.status === 'rejected'
          ? '<span class="clay-badge clay-badge-rejected"><i class="bi bi-x-circle-fill"></i> REJECTED</span>'
          : `<span class="clay-badge bg-secondary-subtle">${c.status}</span>`;

      return `
        <tr>
          <td>
            <div class="fw-bold text-dark fs-6 mb-1">${c.title || c.original_filename}</div>
            <div class="text-muted small text-truncate d-flex align-items-center gap-1" style="max-width: 260px;">
              <i class="bi bi-file-earmark-pdf text-danger"></i>
              <span>${c.original_filename}</span>
            </div>
          </td>
          <td>
            <span class="badge bg-white text-secondary border px-2 py-1 fw-semibold">
              <i class="bi bi-bookmark-check text-primary me-1"></i>${c.template_name || 'Standard Safe Template'}
            </span>
          </td>
          <td>${statusBadge}</td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <span class="badge ${riskClass} px-3 py-1 fs-6">${c.overall_risk_score !== null ? c.overall_risk_score : '--'}</span>
              <span class="small fw-bold text-muted">${band}</span>
            </div>
          </td>
          <td>
            <div class="d-flex align-items-center gap-2">
              <div class="rounded-circle bg-light border text-primary fw-bold d-flex align-items-center justify-content-center" style="width: 28px; height: 28px; font-size: 0.75rem;">
                ${(c.uploader_name || 'A').charAt(0).toUpperCase()}
              </div>
              <span class="small fw-medium text-dark">${c.uploader_name || 'Associate'}</span>
            </div>
          </td>
          <td class="small text-muted fw-medium">${c.created_at ? new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '--'}</td>
          <td class="text-end">
            <button class="btn btn-primary btn-sm px-3 py-1 shadow-sm review-btn" data-id="${c.id}">
              <i class="bi bi-gavel me-1"></i>Decide
            </button>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('.review-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      openDecisionModal(id);
    });
  });
}

async function openDecisionModal(contractId) {
  const contract = contracts.find((c) => c.id === contractId);
  if (!contract) return;

  activeContractForDecision = contract;

  document.getElementById('modalContractTitle').textContent = contract.title || contract.original_filename;
  document.getElementById('modalRiskScore').textContent = `${contract.overall_risk_score || 0}/100`;
  document.getElementById('openFullReviewBtn').href = `/associate/review.html?id=${contract.id}`;
  document.getElementById('partnerNoteInput').value = '';

  const modalEl = document.getElementById('decisionModal');
  const modal = new window.bootstrap.Modal(modalEl);
  modal.show();

  const accordion = document.getElementById('modalFindingsAccordion');
  accordion.innerHTML = '<div class="text-center py-3 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading findings summary...</div>';

  try {
    const res = await api.get(`/contracts/${contractId}/findings`);
    const findings = Array.isArray(res) ? res : (res.findings || []);

    const highCount = findings.filter((f) => f.risk_level === 'HIGH').length;
    document.getElementById('modalHighRiskCount').textContent = highCount;
    document.getElementById('modalTotalFindings').textContent = findings.length;

    if (findings.length === 0) {
      accordion.innerHTML = '<div class="text-muted small p-2">No risk findings recorded.</div>';
      return;
    }

    accordion.innerHTML = findings
      .map((f, i) => {
        const riskClass = f.risk_level === 'HIGH' ? 'badge-risk-high' : f.risk_level === 'MEDIUM' ? 'badge-risk-medium' : 'badge-risk-low';
        return `
          <div class="accordion-item mb-1 border rounded">
            <h2 class="accordion-header" id="heading-${i}">
              <button class="accordion-button collapsed py-2 px-3 small" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${i}">
                <span class="badge ${riskClass} me-2">${f.risk_level}</span>
                <strong class="me-2">${formatClauseTitle(f.clause_type)}</strong>
                <span class="text-muted small ms-auto me-2">Page ${f.page}</span>
              </button>
            </h2>
            <div id="collapse-${i}" class="accordion-collapse collapse" data-bs-parent="#modalFindingsAccordion">
              <div class="accordion-body p-3 bg-light-subtle small">
                <div class="mb-2"><strong>Excerpt:</strong> <span class="fst-italic text-muted">"${f.text_span || ''}"</span></div>
                <div class="mb-2"><strong>Risk Reason:</strong> ${f.reason || ''}</div>
                <div><strong>Suggested Rewrite:</strong> <span class="text-primary">${f.suggested_rewrite || 'Standard benchmark clause.'}</span></div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  } catch (err) {
    accordion.innerHTML = `<div class="text-danger small p-2">Failed to load findings: ${err.message}</div>`;
  }
}

function setupDecisionButtons() {
  const approveBtn = document.getElementById('approveBtn');
  const rejectBtn = document.getElementById('rejectBtn');
  const requestChangesBtn = document.getElementById('requestChangesBtn');
  const modalEl = document.getElementById('decisionModal');

  approveBtn.addEventListener('click', async () => {
    if (!activeContractForDecision) return;
    const note = document.getElementById('partnerNoteInput').value.trim();

    try {
      await api.post(`/contracts/${activeContractForDecision.id}/approve`, { note });
      showToast('Contract approved successfully!', 'success');
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      if (modal) modal.hide();
      await loadContracts();
    } catch (err) {
      showToast('Failed to approve contract: ' + err.message, 'danger');
    }
  });

  rejectBtn.addEventListener('click', async () => {
    if (!activeContractForDecision) return;
    const note = document.getElementById('partnerNoteInput').value.trim();
    if (!note) {
      showToast('Please provide a partner note explaining rejection rationale.', 'warning');
      return;
    }

    try {
      await api.post(`/contracts/${activeContractForDecision.id}/reject`, { note });
      showToast('Contract rejected.', 'info');
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      if (modal) modal.hide();
      await loadContracts();
    } catch (err) {
      showToast('Failed to reject contract: ' + err.message, 'danger');
    }
  });

  requestChangesBtn.addEventListener('click', async () => {
    if (!activeContractForDecision) return;
    const note = document.getElementById('partnerNoteInput').value.trim();
    if (!note) {
      showToast('Please specify the required changes in the note field.', 'warning');
      return;
    }

    try {
      await api.post(`/contracts/${activeContractForDecision.id}/request-changes`, { note });
      showToast('Changes requested. Contract returned to associate in review.', 'info');
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      if (modal) modal.hide();
      await loadContracts();
    } catch (err) {
      showToast('Failed to request changes: ' + err.message, 'danger');
    }
  });

  const exportBtn = document.getElementById('partnerExportReportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      if (!activeContractForDecision) return;
      exportBtn.disabled = true;
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`/api/contracts/${activeContractForDecision.id}/report/pdf`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to generate report');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Clausify-Executive-Report-${activeContractForDecision.id.slice(0, 8)}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast('Executive Risk Report PDF downloaded.', 'success');
      } catch (err) {
        showToast('Failed to export report: ' + err.message, 'danger');
      } finally {
        exportBtn.disabled = false;
      }
    });
  }
}

function formatClauseTitle(type) {
  if (!type) return 'General Clause';
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
