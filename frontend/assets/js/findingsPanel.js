/**
 * Findings Panel Component - Claymorphism Redesign
 * Displays overall risk score gauge, tactile filter chips,
 * detailed findings cards, verbatim quotes, suggested rewrites, rewrite regeneration,
 * status transitions, and comment threads.
 */

import { api } from './api.js';
import { showToast } from './toast.js';

const BENCHMARK_CITATIONS = {
  limitation_of_liability: 'Delaware Commercial Benchmark § 2-719 (Mutual Aggregate Fee Cap)',
  indemnification: 'Delaware Standard § 4.1 (Bilateral Gross Negligence & Third-Party IP Carveout)',
  termination: 'Commercial Standard § 8.3 (Bilateral 30-Day Notice for Convenience)',
  auto_renewal: 'LegalSafe Statutory Standard #3 (Explicit 30-Day Opt-Out Window)',
  intellectual_property: 'Standard Commercial IP § 5.2 (Customer IP Retention & Work-for-Hire)',
  confidentiality: 'Delaware Bench § 6 (Standard 3-Year Confidentiality & DTSA Carveout)',
  governing_law: 'Neutral Jurisdiction (Delaware Court of Chancery / Commercial Division)',
  non_compete: 'LegalSafe Standard #8 (Narrow Customer Non-Solicitation Only)',
  data_privacy: 'GDPR Art. 28 / CCPA § 1798 Standard Data Processing Annex',
  warranty: 'UCC § 2-316 (Express Performance Warranty & 30-Day Cure Period)',
};

function renderDiffHtml(original, rewrite) {
  if (!original || !rewrite) return escapeHtml(rewrite || original || '');
  const origWords = original.trim().split(/\s+/);
  const rewWords = rewrite.trim().split(/\s+/);
  if (original.trim() === rewrite.trim()) return escapeHtml(rewrite);
  let start = 0;
  while (start < origWords.length && start < rewWords.length && origWords[start].toLowerCase() === rewWords[start].toLowerCase()) {
    start++;
  }
  let origEnd = origWords.length - 1;
  let rewEnd = rewWords.length - 1;
  while (origEnd >= start && rewEnd >= start && origWords[origEnd].toLowerCase() === rewWords[rewEnd].toLowerCase()) {
    origEnd--;
    rewEnd--;
  }
  const prefix = origWords.slice(0, start).join(' ');
  const delPart = origWords.slice(start, origEnd + 1).join(' ');
  const addPart = rewWords.slice(start, rewEnd + 1).join(' ');
  const suffix = origWords.slice(origEnd + 1).join(' ');

  let out = '';
  if (prefix) out += escapeHtml(prefix) + ' ';
  if (delPart) out += `<span class="redline-del">${escapeHtml(delPart)}</span> `;
  if (addPart) out += `<span class="redline-add">${escapeHtml(addPart)}</span> `;
  if (suffix) out += escapeHtml(suffix);
  return out;
}

export class FindingsPanel {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Findings container #${containerId} not found`);
    }

    this.contract = options.contract || null;
    this.findings = options.findings || [];
    this.onSelectFinding = options.onSelectFinding || null;
    this.onStatusChange = options.onStatusChange || null;

    this.activeRiskFilter = 'ALL';
    this.activeClauseFilter = 'ALL';
  }

  setData(contract, findings) {
    this.contract = contract;
    this.findings = findings || [];
    this.render();
  }

  render() {
    if (!this.container) return;

    const score = this.contract ? this.contract.overall_risk_score : 0;
    let scoreBand = 'LOW RISK';
    let scoreClass = 'score-low';
    let bandClass = 'badge-risk-low';

    if (score >= 67) {
      scoreBand = 'HIGH RISK';
      scoreClass = 'score-high';
      bandClass = 'badge-risk-high';
    } else if (score >= 34) {
      scoreBand = 'MEDIUM RISK';
      scoreClass = 'score-medium';
      bandClass = 'badge-risk-medium';
    }

    // Counts
    const highCount = this.findings.filter((f) => f.risk_level === 'HIGH').length;
    const medCount = this.findings.filter((f) => f.risk_level === 'MEDIUM').length;
    const lowCount = this.findings.filter((f) => f.risk_level === 'LOW').length;

    // Unique clauses
    const clauseTypes = Array.from(new Set(this.findings.map((f) => f.clause_type))).filter(Boolean);

    this.container.innerHTML = `
      <div class="findings-panel-header p-3 sticky-top" style="z-index: 10;">
        <!-- Score & Band Widget -->
        <div class="d-flex align-items-center justify-content-between mb-3">
          <div>
            <h5 class="fw-bold text-dark mb-0">Risk Findings</h5>
            <span class="text-muted small">${this.findings.length} clauses analyzed vs benchmark</span>
          </div>
          <div class="d-flex align-items-center gap-3">
            <div class="score-circle ${scoreClass} shadow-sm" style="width: 54px; height: 54px; font-size: 1.35rem;">
              ${score !== null ? score : '--'}
            </div>
            <div>
              <span class="badge ${bandClass} text-uppercase px-2 py-1 mb-1 d-inline-block">${scoreBand}</span>
              <div class="small text-muted fw-semibold" style="font-size: 0.7rem;">/ 100 Risk Score</div>
            </div>
          </div>
        </div>

        <!-- Filter Pills -->
        <div class="clay-filter-pills mb-2">
          <button class="clay-pill-btn risk-filter-btn ${this.activeRiskFilter === 'ALL' ? 'active' : ''}" data-risk="ALL">
            All (${this.findings.length})
          </button>
          <button class="clay-pill-btn risk-filter-btn ${this.activeRiskFilter === 'HIGH' ? 'active' : ''}" data-risk="HIGH">
            High (${highCount})
          </button>
          <button class="clay-pill-btn risk-filter-btn ${this.activeRiskFilter === 'MEDIUM' ? 'active' : ''}" data-risk="MEDIUM">
            Med (${medCount})
          </button>
          <button class="clay-pill-btn risk-filter-btn ${this.activeRiskFilter === 'LOW' ? 'active' : ''}" data-risk="LOW">
            Low (${lowCount})
          </button>
        </div>

        <!-- Clause Filter Dropdown -->
        <div>
          <select id="clauseTypeSelect" class="form-select form-select-sm">
            <option value="ALL">All Categories (${clauseTypes.length})</option>
            ${clauseTypes.map((c) => `<option value="${c}" ${this.activeClauseFilter === c ? 'selected' : ''}>${formatClauseTitle(c)}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Findings List Body -->
      <div id="findingsList" class="p-3 flex-grow-1" style="overflow-y: auto;">
        ${this.renderFindingsList()}
      </div>

      <!-- Footer Workflow Action -->
      <div class="findings-panel-footer p-3 sticky-bottom">
        <div class="d-flex justify-content-between align-items-center gap-3">
          <div class="small text-muted">
            Status: <span class="fw-bold text-dark text-uppercase">${this.contract ? this.contract.status : 'analyzed'}</span>
          </div>
          <div class="flex-grow-1 text-end">
            ${this.renderWorkflowButton()}
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  renderFindingsList() {
    let filtered = this.findings;

    if (this.activeRiskFilter !== 'ALL') {
      filtered = filtered.filter((f) => f.risk_level === this.activeRiskFilter);
    }

    if (this.activeClauseFilter !== 'ALL') {
      filtered = filtered.filter((f) => f.clause_type === this.activeClauseFilter);
    }

    if (filtered.length === 0) {
      return `
        <div class="text-center py-5 text-muted">
          <div class="p-3 bg-light rounded-circle d-inline-block mb-3">
            <i class="bi bi-shield-check display-6 text-success"></i>
          </div>
          <h6 class="fw-bold text-dark">No findings in this category</h6>
          <p class="small text-muted mb-0">No risk issues detected matching the selected filter.</p>
        </div>
      `;
    }

    return filtered
      .map((finding) => {
        const riskClass =
          finding.risk_level === 'HIGH'
            ? 'badge-risk-high'
            : finding.risk_level === 'MEDIUM'
            ? 'badge-risk-medium'
            : 'badge-risk-low';

        const riskBoxClass =
          finding.risk_level === 'HIGH'
            ? 'high'
            : finding.risk_level === 'MEDIUM'
            ? 'medium'
            : 'low';

        const statusClass =
          finding.status === 'accepted'
            ? 'clay-badge-approved'
            : finding.status === 'dismissed'
            ? 'clay-badge-rejected'
            : 'clay-badge-processing';

        const benchmarkCite = BENCHMARK_CITATIONS[finding.clause_type] || 'Delaware Statutory Standard / UCC Article 2';
        const diffMarkup = renderDiffHtml(finding.text_span, finding.suggested_rewrite);

        return `
          <div class="clay-finding-card p-3 finding-card" id="finding-card-${finding.id}" data-id="${finding.id}" data-page="${finding.page}">
            <!-- Header -->
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <h6 class="fw-bold text-dark mb-1">${formatClauseTitle(finding.clause_type)}</h6>
                <div class="d-flex align-items-center gap-1 flex-wrap">
                  <span class="badge ${riskClass}">${finding.risk_level} RISK</span>
                  <span class="badge bg-light text-secondary border">Page ${finding.page}</span>
                  ${finding.verified ? '<span class="badge bg-success-subtle text-success-emphasis border border-success-subtle"><i class="bi bi-check-circle-fill me-1"></i>Verified Quote</span>' : ''}
                </div>
              </div>
              <div>
                <span class="clay-badge ${statusClass} text-uppercase" style="font-size: 0.7rem;">
                  ${finding.status || 'open'}
                </span>
              </div>
            </div>

            <!-- Statutory Benchmark Citation -->
            <div class="mb-2.5 py-1 px-2 rounded bg-slate-100 border text-slate-700 small d-flex align-items-center gap-1.5" style="font-size: 0.73rem;">
              <i class="bi bi-shield-check text-primary"></i>
              <span class="fw-semibold text-truncate">Benchmark: ${escapeHtml(benchmarkCite)}</span>
            </div>

            <!-- Excerpt Box -->
            <div class="clay-quote-box ${riskBoxClass} mb-3">
              <div class="text-muted small fw-bold mb-1 d-flex align-items-center gap-1">
                <i class="bi bi-file-text"></i>
                <span>ORIGINAL CONTRACT TEXT:</span>
              </div>
              <div class="fst-italic small text-dark">${escapeHtml(finding.text_span || 'No extractable text span')}</div>
            </div>

            <!-- Risk Rationale -->
            <div class="mb-3 px-1">
              <div class="text-secondary small fw-bold mb-1 d-flex align-items-center gap-1">
                <i class="bi bi-shield-exclamation text-danger"></i>
                <span>WHY THIS IS RISKY:</span>
              </div>
              <p class="small text-secondary mb-0 fw-medium">${escapeHtml(finding.reason || '')}</p>
            </div>

            <!-- SpeedLegal Proposed Redline & Rewrite Box -->
            <div class="clay-rewrite-box mb-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="small fw-bold text-success d-flex align-items-center gap-1">
                  <i class="bi bi-magic"></i>
                  <span>PROPOSED STATUTORY REDLINE</span>
                </span>
                <button class="btn btn-sm btn-link text-success p-0 fw-bold copy-rewrite-btn text-decoration-none" data-rewrite="${encodeURIComponent(finding.suggested_rewrite || '')}">
                  <i class="bi bi-clipboard me-1"></i>Copy
                </button>
              </div>

              <!-- Redline Diff View -->
              <div class="p-2 mb-2 rounded bg-white border" style="font-size: 0.82rem; line-height: 1.6;">
                <div class="small text-muted fw-bold mb-1 d-flex justify-content-between align-items-center" style="font-size: 0.68rem;">
                  <span>VISUAL REDLINE (DELETIONS / ADDITIONS):</span>
                  <span class="badge bg-slate-100 text-slate-600 border py-0 px-1.5 font-normal">Auto-Diff</span>
                </div>
                <div class="text-slate-800 redline-diff-content font-mono-sm">
                  ${diffMarkup}
                </div>
              </div>

              <!-- Clean Rewrite Text -->
              <div class="small text-secondary mb-2 rewrite-text" id="rewrite-text-${finding.id}" style="font-size: 0.8rem;">
                <span class="text-muted fw-bold d-block mb-0.5" style="font-size: 0.68rem;">CLEAN REPLACEMENT CLAUSE:</span>
                ${escapeHtml(finding.suggested_rewrite || 'Standard benchmark clause recommended.')}
              </div>

              <!-- Tone & Regenerate Controls -->
              <div class="d-flex align-items-center gap-2 pt-2 border-top border-success-subtle">
                <span class="small text-muted fw-semibold">Tone:</span>
                <select class="form-select form-select-sm py-0 tone-select" style="width: auto; font-size: 0.75rem;" id="tone-${finding.id}">
                  <option value="neutral" selected>Neutral</option>
                  <option value="firm">Firm</option>
                </select>
                <button class="btn btn-outline-success btn-sm py-0 regenerate-btn" style="font-size: 0.75rem;" data-id="${finding.id}">
                  <i class="bi bi-arrow-repeat me-1"></i>Regenerate
                </button>
              </div>
            </div>

            <!-- Card Actions -->
            <div class="d-flex justify-content-between align-items-center pt-2 border-top">
              <div class="d-flex gap-2">
                <button class="btn btn-sm ${finding.status === 'accepted' ? 'btn-success' : 'btn-outline-success'} status-btn py-1 px-3" data-id="${finding.id}" data-status="accepted" ${finding.status === 'accepted' ? 'disabled' : ''}>
                  <i class="bi bi-check2 me-1"></i>Accept
                </button>
                <button class="btn btn-sm ${finding.status === 'dismissed' ? 'btn-secondary' : 'btn-outline-secondary'} status-btn py-1 px-3" data-id="${finding.id}" data-status="dismissed" ${finding.status === 'dismissed' ? 'disabled' : ''}>
                  <i class="bi bi-x me-1"></i>Dismiss
                </button>
              </div>

              <button class="btn btn-sm btn-link text-secondary p-0 toggle-comments-btn text-decoration-none fw-semibold" data-id="${finding.id}">
                <i class="bi bi-chat-dots me-1"></i>Comments (<span id="comment-count-${finding.id}">0</span>)
              </button>
            </div>

            <!-- Comments Section -->
            <div class="comments-section mt-3 pt-2 border-top d-none" id="comments-section-${finding.id}">
              <div class="comments-list small mb-2" id="comments-list-${finding.id}">
                <span class="text-muted">Loading comments...</span>
              </div>
              <div class="input-group input-group-sm">
                <input type="text" class="form-control comment-input" id="comment-input-${finding.id}" placeholder="Type review comment...">
                <button class="btn btn-primary add-comment-btn px-3" data-id="${finding.id}">Post</button>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  renderWorkflowButton() {
    if (!this.contract) return '';
    const status = this.contract.status;

    if (status === 'analyzed' || status === 'in_review') {
      return `
        <button id="submitApprovalBtn" class="btn btn-primary btn-sm px-3 py-1 shadow-sm fw-bold">
          <i class="bi bi-send-check me-1"></i>Submit for Partner Approval
        </button>
      `;
    }

    if (status === 'escalated') {
      return `
        <span class="clay-badge clay-badge-in-review">
          <i class="bi bi-hourglass-split me-1"></i>Pending Partner Decision
        </span>
      `;
    }

    if (status === 'approved') {
      return `
        <span class="clay-badge clay-badge-approved">
          <i class="bi bi-check-circle-fill me-1"></i>Contract Approved
        </span>
      `;
    }

    if (status === 'rejected') {
      return `
        <span class="clay-badge clay-badge-rejected">
          <i class="bi bi-x-circle-fill me-1"></i>Contract Rejected
        </span>
      `;
    }

    return '';
  }

  attachEventListeners() {
    // Risk filter buttons
    this.container.querySelectorAll('.risk-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.activeRiskFilter = btn.getAttribute('data-risk');
        this.render();
      });
    });

    // Clause filter dropdown
    const clauseSelect = this.container.querySelector('#clauseTypeSelect');
    if (clauseSelect) {
      clauseSelect.addEventListener('change', (e) => {
        this.activeClauseFilter = e.target.value;
        this.render();
      });
    }

    // Card click -> jump to PDF page
    this.container.querySelectorAll('.finding-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        // Prevent if clicking on buttons or inputs
        if (['BUTTON', 'INPUT', 'SELECT', 'A', 'I'].includes(e.target.tagName)) return;
        const findingId = card.getAttribute('data-id');
        const page = parseInt(card.getAttribute('data-page'), 10) || 1;
        if (this.onSelectFinding) {
          this.onSelectFinding(findingId, page);
        }
      });
    });

    // Copy rewrite
    this.container.querySelectorAll('.copy-rewrite-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = decodeURIComponent(btn.getAttribute('data-rewrite'));
        navigator.clipboard.writeText(text);
        showToast('Suggested rewrite copied to clipboard!', 'success');
      });
    });

    // Regenerate rewrite
    this.container.querySelectorAll('.regenerate-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const findingId = btn.getAttribute('data-id');
        const toneSelect = document.getElementById(`tone-${findingId}`);
        const tone = toneSelect ? toneSelect.value : 'neutral';

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Rewriting...';

        try {
          const res = await api.post(`/findings/${findingId}/rewrite`, { tone });
          if (res && res.suggested_rewrite) {
            const rewriteEl = document.getElementById(`rewrite-text-${findingId}`);
            if (rewriteEl) {
              rewriteEl.textContent = res.suggested_rewrite;
            }
            showToast(`Regenerated rewrite with ${tone} tone!`, 'success');
          }
        } catch (err) {
          showToast('Failed to regenerate rewrite: ' + err.message, 'danger');
        } finally {
          btn.disabled = false;
          btn.innerHTML = '<i class="bi bi-arrow-repeat me-1"></i>Regenerate';
        }
      });
    });

    // Update finding status (accept/dismiss)
    this.container.querySelectorAll('.status-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const findingId = btn.getAttribute('data-id');
        const newStatus = btn.getAttribute('data-status');

        try {
          await api.patch(`/findings/${findingId}`, { status: newStatus });
          showToast(`Finding marked as ${newStatus}.`, 'success');

          // Update finding object locally and notify
          const f = this.findings.find((x) => x.id === findingId);
          if (f) f.status = newStatus;
          this.render();

          if (this.onStatusChange) {
            this.onStatusChange(findingId, newStatus);
          }
        } catch (err) {
          showToast('Failed to update status: ' + err.message, 'danger');
        }
      });
    });

    // Toggle comments
    this.container.querySelectorAll('.toggle-comments-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const findingId = btn.getAttribute('data-id');
        const section = document.getElementById(`comments-section-${findingId}`);
        if (!section) return;

        if (section.classList.contains('d-none')) {
          section.classList.remove('d-none');
          await this.loadComments(findingId);
        } else {
          section.classList.add('d-none');
        }
      });
    });

    // Add comment
    this.container.querySelectorAll('.add-comment-btn').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const findingId = btn.getAttribute('data-id');
        const input = document.getElementById(`comment-input-${findingId}`);
        const body = input.value.trim();
        if (!body) return;

        btn.disabled = true;
        try {
          await api.post(`/findings/${findingId}/comments`, { body });
          input.value = '';
          await this.loadComments(findingId);
          showToast('Comment added.', 'success');
        } catch (err) {
          showToast('Failed to post comment: ' + err.message, 'danger');
        } finally {
          btn.disabled = false;
        }
      });
    });

    // Submit for approval button
    const submitBtn = this.container.querySelector('#submitApprovalBtn');
    if (submitBtn) {
      submitBtn.addEventListener('click', async () => {
        if (!confirm('Are you sure you want to submit this contract review for Partner approval?')) {
          return;
        }

        submitBtn.disabled = true;
        try {
          await api.post(`/contracts/${this.contract.id}/submit`);
          showToast('Contract escalated for partner approval!', 'success');
          if (this.contract) this.contract.status = 'escalated';
          this.render();
        } catch (err) {
          showToast('Failed to submit for approval: ' + err.message, 'danger');
          submitBtn.disabled = false;
        }
      });
    }
  }

  async loadComments(findingId) {
    const listEl = document.getElementById(`comments-list-${findingId}`);
    const countEl = document.getElementById(`comment-count-${findingId}`);
    if (!listEl) return;

    try {
      const res = await api.get(`/findings/${findingId}/comments`);
      const comments = Array.isArray(res) ? res : (res.comments || []);
      if (countEl) countEl.textContent = comments.length;

      if (comments.length === 0) {
        listEl.innerHTML = '<span class="text-muted fst-italic">No comments yet.</span>';
        return;
      }

      listEl.innerHTML = comments
        .map(
          (c) => `
        <div class="p-2 mb-1 rounded bg-light border">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="fw-semibold text-primary" style="font-size: 0.75rem;">${c.user_name || 'User'}</span>
            <span class="text-muted" style="font-size: 0.65rem;">${new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div class="text-dark" style="font-size: 0.8rem;">${escapeHtml(c.body)}</div>
        </div>
      `
        )
        .join('');
    } catch (err) {
      listEl.innerHTML = `<span class="text-danger small">Failed to load comments: ${err.message}</span>`;
    }
  }

  focusFinding(findingId) {
    const card = document.getElementById(`finding-card-${findingId}`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('active-card');
      setTimeout(() => {
        card.classList.remove('active-card');
      }, 2500);
    }
  }
}

function formatClauseTitle(type) {
  if (!type) return 'General Clause';
  return type
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default FindingsPanel;
