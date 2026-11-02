/**
 * Associate Dashboard Page Controller
 */

import { api } from '../api.js';
import { requireAuth, renderNavbar } from '../auth.js';
import { showToast } from '../toast.js';

let contractsList = [];
let activeFilter = 'all';
let searchQuery = '';
let pollInterval = null;
let selectedFile = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth(['associate', 'partner', 'admin']);
  if (!user) return;

  renderNavbar('associate-dashboard');

  setupUploadZone();
  setupFilterTabs();
  setupSearch();

  await loadTemplates();
  await loadContracts();

  // Polling loop
  startPolling();
});

function setupUploadZone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const browseBtn = document.getElementById('browseBtn');
  const selectedFileName = document.getElementById('selectedFileName');
  const startUploadBtn = document.getElementById('startUploadBtn');
  const uploadForm = document.getElementById('uploadForm');

  browseBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('bg-primary-subtle', 'border-primary');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('bg-primary-subtle', 'border-primary');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  function handleFileSelected(file) {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      showToast('Please select a valid PDF file.', 'danger');
      return;
    }
    selectedFile = file;
    selectedFileName.textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    selectedFileName.classList.remove('d-none');
    startUploadBtn.disabled = false;
  }

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      showToast('Please select a PDF file first.', 'warning');
      return;
    }

    const templateSelect = document.getElementById('templateSelect');
    const templateId = templateSelect.value;
    if (!templateId) {
      showToast('Please select a benchmark safe template.', 'warning');
      return;
    }

    const titleInput = document.getElementById('contractTitleInput');
    const title = titleInput.value.trim() || selectedFile.name.replace(/\.[^/.]+$/, '');

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('title', title);
    formData.append('template_id', templateId);

    const uploadSpinner = document.getElementById('uploadSpinner');
    const uploadBtnText = document.getElementById('uploadBtnText');
    const statusMsg = document.getElementById('uploadStatusMessage');

    startUploadBtn.disabled = true;
    uploadSpinner.classList.remove('d-none');
    uploadBtnText.textContent = 'Uploading & Ingesting...';
    statusMsg.innerHTML = '<span class="text-primary"><i class="bi bi-gear-wide-connected me-1 spin-icon"></i> Extracting text and initiating AI risk analysis...</span>';

    try {
      const response = await api.upload('/contracts', formData);
      showToast('Contract uploaded and analysis initiated successfully!', 'success');

      // Reset form
      selectedFile = null;
      fileInput.value = '';
      titleInput.value = '';
      selectedFileName.classList.add('d-none');
      statusMsg.innerHTML = '<span class="text-success"><i class="bi bi-check-circle me-1"></i> Analysis in progress. See table below.</span>';
      uploadSpinner.classList.add('d-none');
      uploadBtnText.textContent = 'Upload & Run AI Risk Analysis';

      // Reload contracts
      await loadContracts();
    } catch (err) {
      showToast(err.message || 'Failed to upload contract.', 'danger');
      statusMsg.innerHTML = `<span class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i> ${err.message}</span>`;
      startUploadBtn.disabled = false;
      uploadSpinner.classList.add('d-none');
      uploadBtnText.textContent = 'Upload & Run AI Risk Analysis';
    }
  });
}

async function loadTemplates() {
  const select = document.getElementById('templateSelect');
  try {
    const res = await api.get('/templates', { status: 'active' });
    const templates = Array.isArray(res) ? res : (res.templates || []);
    if (!templates || templates.length === 0) {
      select.innerHTML = '<option value="">No active templates found</option>';
      return;
    }

    const hasActive = templates.some((t) => t.status === 'active');
    select.innerHTML = templates
      .map(
        (t, idx) => `
      <option value="${t.id}" ${(t.status === 'active' || (!hasActive && idx === 0)) ? 'selected' : ''}>
        ${t.name} (v${t.version}) - ${t.clause_count || 10} clauses
      </option>
    `
      )
      .join('');
  } catch (err) {
    select.innerHTML = '<option value="">Failed to load templates</option>';
    showToast('Failed to load benchmark templates: ' + err.message, 'danger');
  }
}

async function loadContracts() {
  try {
    const res = await api.get('/contracts');
    contractsList = Array.isArray(res) ? res : (res.contracts || []);
    renderContractsTable();
  } catch (err) {
    showToast('Failed to fetch contracts: ' + err.message, 'danger');
  }
}

function setupFilterTabs() {
  const tabs = document.querySelectorAll('.filter-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.getAttribute('data-filter');
      renderContractsTable();
    });
  });
}

function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderContractsTable();
  });
}

function renderContractsTable() {
  const tbody = document.getElementById('contractsTableBody');

  let filtered = contractsList;

  // Filter by tab
  if (activeFilter !== 'all') {
    filtered = filtered.filter((c) => c.status === activeFilter);
  }

  // Filter by search
  if (searchQuery) {
    filtered = filtered.filter(
      (c) =>
        (c.title && c.title.toLowerCase().includes(searchQuery)) ||
        (c.original_filename && c.original_filename.toLowerCase().includes(searchQuery))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-4 d-block mb-1"></i>
          No contracts found matching the criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map((c) => {
      // Risk Badge / Score
      let riskHtml = '<span class="text-muted small fw-medium">Pending...</span>';
      if (c.overall_risk_score !== null && c.overall_risk_score !== undefined) {
        let badgeClass = 'badge-risk-low';
        let band = 'LOW RISK';
        if (c.overall_risk_score >= 67) {
          badgeClass = 'badge-risk-high';
          band = 'HIGH RISK';
        } else if (c.overall_risk_score >= 34) {
          badgeClass = 'badge-risk-medium';
          band = 'MEDIUM RISK';
        }
        riskHtml = `
          <div class="d-flex align-items-center gap-2 text-nowrap">
            <span class="badge ${badgeClass} px-3 py-1 fs-6">${c.overall_risk_score}</span>
            <span class="small fw-bold text-secondary text-nowrap">${band}</span>
          </div>
        `;
      }

      // Status Badge
      let statusBadge = '';
      switch (c.status) {
        case 'uploaded':
        case 'processing':
          statusBadge = `
            <span class="clay-badge clay-badge-processing">
              <span class="spinner-border spinner-border-sm" style="width: 0.75rem; height: 0.75rem;" role="status"></span>
              ANALYZING
            </span>
          `;
          break;
        case 'analyzed':
        case 'in_review':
          statusBadge = '<span class="clay-badge clay-badge-in-review"><i class="bi bi-clock-history"></i> IN REVIEW</span>';
          break;
        case 'escalated':
          statusBadge = '<span class="clay-badge clay-badge-escalated"><i class="bi bi-exclamation-octagon"></i> ESCALATED</span>';
          break;
        case 'approved':
          statusBadge = '<span class="clay-badge clay-badge-approved"><i class="bi bi-check-circle-fill"></i> APPROVED</span>';
          break;
        case 'rejected':
          statusBadge = '<span class="clay-badge clay-badge-rejected"><i class="bi bi-x-circle-fill"></i> REJECTED</span>';
          break;
        case 'failed':
          statusBadge = `<span class="clay-badge clay-badge-escalated" title="${c.failure_reason || 'Analysis failed'}"><i class="bi bi-exclamation-triangle"></i> FAILED</span>`;
          break;
        default:
          statusBadge = `<span class="clay-badge bg-secondary-subtle">${c.status}</span>`;
      }

      const dateStr = c.created_at ? new Date(c.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '--';

      return `
        <tr>
          <td>
            <div class="fw-bold text-dark fs-6 mb-1">${c.title || c.original_filename}</div>
            <div class="text-muted small text-truncate d-flex align-items-center gap-1" style="max-width: 280px;">
              <i class="bi bi-file-earmark-pdf text-danger fs-6"></i>
              <span>${c.original_filename}</span>
            </div>
          </td>
          <td>
            <span class="badge bg-white text-secondary border px-2 py-1 fw-semibold shadow-xs">
              <i class="bi bi-bookmark-check text-primary me-1"></i>${c.template_name || 'Standard Safe Template'}
            </span>
          </td>
          <td>${statusBadge}</td>
          <td>${riskHtml}</td>
          <td><span class="badge bg-light text-secondary border px-2 py-1">${c.page_count || 1} pgs</span></td>
          <td class="small text-muted fw-medium">${dateStr}</td>
          <td class="text-end">
            <div class="d-flex justify-content-end align-items-center gap-2">
              <a href="/associate/review.html?id=${c.id}" class="btn btn-primary btn-sm px-3 py-1 shadow-sm d-inline-flex align-items-center gap-1" title="Open Review Workspace">
                <i class="bi bi-search"></i>
                <span>Review</span>
              </a>
              <button class="btn btn-outline-secondary btn-sm reanalyze-btn p-1 px-2" data-id="${c.id}" title="Re-run AI Analysis">
                <i class="bi bi-arrow-repeat"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  // Attach reanalyze buttons
  document.querySelectorAll('.reanalyze-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const contractId = btn.getAttribute('data-id');
      btn.disabled = true;
      try {
        await api.post(`/contracts/${contractId}/reanalyze`);
        showToast('Analysis restarted for contract.', 'info');
        await loadContracts();
      } catch (err) {
        showToast('Failed to restart analysis: ' + err.message, 'danger');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(async () => {
    const hasProcessing = contractsList.some((c) => c.status === 'uploaded' || c.status === 'processing');
    if (hasProcessing) {
      await loadContracts();
    }
  }, 3000);
}
