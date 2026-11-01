/**
 * Partner Safe Templates Controller
 */

import { api } from '../api.js';
import { requireAuth, renderNavbar } from '../auth.js';
import { showToast } from '../toast.js';

const STANDARD_CLAUSE_TYPES = [
  { type: 'limitation_of_liability', label: 'Limitation of Liability', defaultTitle: 'Standard Liability Cap' },
  { type: 'indemnification', label: 'Indemnification', defaultTitle: 'Mutual Indemnification' },
  { type: 'governing_law', label: 'Governing Law & Jurisdiction', defaultTitle: 'Governing Law and Jurisdiction' },
  { type: 'termination_notice', label: 'Termination Notice', defaultTitle: 'Notice Period for Termination' },
  { type: 'data_privacy', label: 'Data Privacy & Security', defaultTitle: 'Data Protection & Security Compliance' },
  { type: 'intellectual_property', label: 'Intellectual Property', defaultTitle: 'IP Ownership and License' },
  { type: 'confidentiality', label: 'Confidentiality', defaultTitle: 'Protection of Confidential Information' },
  { type: 'payment_terms', label: 'Payment Terms', defaultTitle: 'Standard Payment Schedule & Invoicing' },
  { type: 'warranty_disclaimer', label: 'Warranty & Disclaimer', defaultTitle: 'Standard Service Warranties' },
  { type: 'force_majeure', label: 'Force Majeure', defaultTitle: 'Standard Force Majeure Exclusions' },
];

let templates = [];
let selectedTemplateId = null;
let currentTemplateData = null;

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth(['partner', 'admin']);
  if (!user) return;

  renderNavbar('partner-templates');

  setupCreateTemplate();
  setupSaveTemplate();
  setupActivateTemplate();
  setupVersionHistory();

  await loadTemplates();
});

async function loadTemplates() {
  const listGroup = document.getElementById('templatesListGroup');
  try {
    const res = await api.get('/templates');
    templates = Array.isArray(res) ? res : (res.templates || []);
    if (templates.length === 0) {
      listGroup.innerHTML = '<div class="text-center py-3 text-muted small">No templates found.</div>';
      return;
    }

    listGroup.innerHTML = templates
      .map(
        (t) => `
      <div class="template-item p-3 mb-2 rounded-4 border d-flex justify-content-between align-items-center cursor-pointer transition-all ${t.id === selectedTemplateId ? 'bg-white shadow-sm border-primary' : 'bg-light border-transparent'}" data-id="${t.id}" style="cursor: pointer;">
        <div>
          <div class="fw-bold text-dark text-truncate" style="max-width: 160px;">${t.name}</div>
          <small class="text-muted">v${t.version} &bull; ${t.clause_count || 10} clauses</small>
        </div>
        <span class="clay-badge ${t.status === 'active' ? 'clay-badge-approved' : 'clay-badge-processing'} text-uppercase" style="font-size: 0.65rem;">
          ${t.status}
        </span>
      </div>
    `
      )
      .join('');

    // Attach click listeners
    listGroup.querySelectorAll('.template-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        selectTemplate(id);
      });
    });

    // Auto-select first or active template
    if (!selectedTemplateId) {
      const active = templates.find((t) => t.status === 'active') || templates[0];
      if (active) selectTemplate(active.id);
    }
  } catch (err) {
    listGroup.innerHTML = `<div class="text-danger small p-2">Failed to load templates: ${err.message}</div>`;
  }
}

async function selectTemplate(templateId) {
  selectedTemplateId = templateId;

  // Highlight list item
  document.querySelectorAll('.template-item').forEach((el) => {
    const isSel = el.getAttribute('data-id') === templateId;
    el.classList.toggle('bg-white', isSel);
    el.classList.toggle('shadow-sm', isSel);
    el.classList.toggle('border-primary', isSel);
    el.classList.toggle('bg-light', !isSel);
  });

  const loadingEl = document.getElementById('editorLoading');
  const contentEl = document.getElementById('editorContent');
  loadingEl.classList.remove('d-none');
  contentEl.classList.add('d-none');

  try {
    const res = await api.get(`/templates/${templateId}`);
    currentTemplateData = res.template ? { ...res.template, clauses: res.clauses || [] } : res;

    // Update Header Metadata
    document.getElementById('templateTitle').textContent = currentTemplateData.name;
    document.getElementById('templateDescription').textContent = currentTemplateData.description || 'Master corporate baseline safe template';
    
    const statusBadge = document.getElementById('templateStatusBadge');
    statusBadge.textContent = (currentTemplateData.status || 'draft').toUpperCase();
    statusBadge.className = `clay-badge ${currentTemplateData.status === 'active' ? 'clay-badge-approved' : 'clay-badge-processing'}`;

    document.getElementById('templateVersionBadge').textContent = `Version ${currentTemplateData.version}`;
    document.getElementById('templateLastUpdated').textContent = `Updated: ${new Date(currentTemplateData.updated_at).toLocaleDateString()}`;

    // Activate button visibility
    const activateBtn = document.getElementById('activateBtn');
    if (currentTemplateData.status !== 'active') {
      activateBtn.classList.remove('d-none');
    } else {
      activateBtn.classList.add('d-none');
    }

    renderClausesAccordion(currentTemplateData.clauses || []);

    loadingEl.classList.add('d-none');
    contentEl.classList.remove('d-none');
  } catch (err) {
    loadingEl.innerHTML = `<div class="alert alert-danger m-3">Failed to load template details: ${err.message}</div>`;
  }
}

function renderClausesAccordion(existingClauses) {
  const accordion = document.getElementById('clausesAccordion');

  const clauseMap = new Map();
  existingClauses.forEach((c) => clauseMap.set(c.clause_type, c));

  accordion.innerHTML = STANDARD_CLAUSE_TYPES.map((std, index) => {
    const existing = clauseMap.get(std.type);
    const titleVal = existing ? existing.title : std.defaultTitle;
    const textVal = existing ? existing.text : '';
    const collapseId = `collapseClause-${index}`;
    const headerId = `headingClause-${index}`;

    return `
      <div class="accordion-item mb-2 border rounded">
        <h2 class="accordion-header" id="${headerId}">
          <button class="accordion-button ${index === 0 ? '' : 'collapsed'} py-2 px-3 fw-semibold" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="${index === 0 ? 'true' : 'false'}" aria-controls="${collapseId}">
            <span class="me-2 text-primary"><i class="bi bi-shield-check"></i></span>
            <span>${std.label}</span>
            <span class="badge bg-light text-muted border ms-auto me-2" style="font-size: 0.7rem;">${std.type}</span>
          </button>
        </h2>
        <div id="${collapseId}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" aria-labelledby="${headerId}" data-bs-parent="#clausesAccordion">
          <div class="accordion-body p-3 bg-light-subtle">
            <div class="mb-2">
              <label class="form-label small fw-semibold text-muted">CLAUSE TITLE</label>
              <input type="text" class="form-control form-control-sm clause-title-input" data-type="${std.type}" value="${titleVal}">
            </div>
            <div>
              <label class="form-label small fw-semibold text-muted">STANDARD SAFE LEGAL TEXT</label>
              <textarea class="form-control clause-text-input" data-type="${std.type}" rows="4" placeholder="Enter safe standard clause text for ${std.label}...">${textVal}</textarea>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function setupSaveTemplate() {
  const saveBtn = document.getElementById('saveTemplateBtn');
  const spinner = document.getElementById('saveSpinner');
  const saveBtnText = document.getElementById('saveBtnText');
  const reembedAlert = document.getElementById('reembedAlert');

  saveBtn.addEventListener('click', async () => {
    if (!selectedTemplateId) return;

    // Collect all clause texts
    const clauses = [];
    STANDARD_CLAUSE_TYPES.forEach((std) => {
      const titleInput = document.querySelector(`.clause-title-input[data-type="${std.type}"]`);
      const textInput = document.querySelector(`.clause-text-input[data-type="${std.type}"]`);

      const title = titleInput ? titleInput.value.trim() : std.defaultTitle;
      const text = textInput ? textInput.value.trim() : '';

      if (text) {
        clauses.push({
          clause_type: std.type,
          title: title || std.defaultTitle,
          text,
        });
      }
    });

    saveBtn.disabled = true;
    spinner.classList.remove('d-none');
    saveBtnText.textContent = 'Saving & Re-embedding...';
    reembedAlert.classList.remove('d-none');

    try {
      const updated = await api.put(`/templates/${selectedTemplateId}`, {
        clauses,
      });

      const newVersion = updated.template ? updated.template.version : (updated.version || '2');
      showToast(`Template updated to v${newVersion} and re-embedded successfully!`, 'success');
      reembedAlert.classList.add('d-none');

      // Refresh template
      await loadTemplates();
      await selectTemplate(selectedTemplateId);
    } catch (err) {
      showToast('Failed to save template: ' + err.message, 'danger');
      reembedAlert.classList.add('d-none');
    } finally {
      saveBtn.disabled = false;
      spinner.classList.add('d-none');
      saveBtnText.innerHTML = '<i class="bi bi-save me-1"></i>Save & Re-embed';
    }
  });
}

function setupActivateTemplate() {
  const activateBtn = document.getElementById('activateBtn');
  activateBtn.addEventListener('click', async () => {
    if (!selectedTemplateId) return;

    try {
      await api.post(`/templates/${selectedTemplateId}/activate`);
      showToast('Template activated as primary benchmark!', 'success');
      await loadTemplates();
      await selectTemplate(selectedTemplateId);
    } catch (err) {
      showToast('Failed to activate template: ' + err.message, 'danger');
    }
  });
}

function setupCreateTemplate() {
  const form = document.getElementById('createTemplateForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('newTemplateName');
    const descInput = document.getElementById('newTemplateDesc');
    const submitBtn = document.getElementById('createSubmitBtn');

    submitBtn.disabled = true;

    try {
      const res = await api.post('/templates', {
        name: nameInput.value.trim(),
        description: descInput.value.trim(),
      });
      const created = res.template || res;

      showToast(`Template "${created.name}" created!`, 'success');

      // Hide modal
      const modalEl = document.getElementById('createTemplateModal');
      const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
      if (modal) modal.hide();

      form.reset();
      await loadTemplates();
      selectTemplate(created.id);
    } catch (err) {
      showToast('Failed to create template: ' + err.message, 'danger');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

function setupVersionHistory() {
  const viewHistoryBtn = document.getElementById('viewHistoryBtn');
  const historyModalEl = document.getElementById('versionHistoryModal');
  const tbody = document.getElementById('versionHistoryBody');

  viewHistoryBtn.addEventListener('click', async () => {
    if (!selectedTemplateId) return;

    const modal = new window.bootstrap.Modal(historyModalEl);
    modal.show();

    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading snapshot history...</td></tr>';

    try {
      const res = await api.get(`/templates/${selectedTemplateId}/versions`);
      const versions = Array.isArray(res) ? res : (res.versions || []);
      if (versions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-3 text-muted">No prior snapshots recorded.</td></tr>';
        return;
      }

      tbody.innerHTML = versions
        .map(
          (v) => `
        <tr>
          <td><span class="badge bg-secondary">v${v.version}</span></td>
          <td class="small text-muted">${new Date(v.changed_at).toLocaleString()}</td>
          <td class="small">${v.snapshot && v.snapshot.clauses ? v.snapshot.clauses.length : '--'} clauses</td>
          <td>
            <button class="btn btn-outline-primary btn-sm py-0 px-2 view-snapshot-btn" data-json="${encodeURIComponent(JSON.stringify(v.snapshot))}">
              <i class="bi bi-file-earmark-code me-1"></i>Inspect
            </button>
          </td>
        </tr>
      `
        )
        .join('');

      tbody.querySelectorAll('.view-snapshot-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const raw = decodeURIComponent(btn.getAttribute('data-json'));
          alert('Snapshot JSON:\n\n' + raw.slice(0, 500) + '...');
        });
      });
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-danger small py-3">Failed to load versions: ${err.message}</td></tr>`;
    }
  });
}
