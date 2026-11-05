/**
 * Associate Contract Review Workspace Controller
 */

import { api } from '../api.js';
import { requireAuth, renderNavbar, getToken } from '../auth.js';
import { showToast } from '../toast.js';
import { PdfViewer } from '../pdfViewer.js';
import { FindingsPanel } from '../findingsPanel.js';

let pdfViewer = null;
let findingsPanel = null;
let currentScale = 1.15;

document.addEventListener('DOMContentLoaded', async () => {
  const user = requireAuth(['associate', 'partner', 'admin']);
  if (!user) return;

  renderNavbar('associate-dashboard');

  const params = new URLSearchParams(window.location.search);
  const contractId = params.get('id');

  if (!contractId) {
    showToast('No contract ID provided.', 'danger');
    setTimeout(() => {
      window.location.href = '/associate/dashboard.html';
    }, 1500);
    return;
  }

  // Initialize Components
  findingsPanel = new FindingsPanel('findingsPanelContainer', {
    onSelectFinding: (findingId, page) => {
      if (pdfViewer) {
        pdfViewer.scrollToFinding(findingId, page);
      }
    },
    onStatusChange: (findingId, newStatus) => {
      // Re-apply highlights if status changed
      if (pdfViewer) {
        pdfViewer.applyAllHighlights();
      }
    },
  });

  pdfViewer = new PdfViewer('pdfViewerContainer', {
    initialScale: currentScale,
    onFindingClick: (findingId) => {
      if (findingsPanel) {
        findingsPanel.focusFinding(findingId);
      }
    },
  });

  setupZoomControls();
  setupReportExport(contractId);

  try {
    console.log('[Review] 1. Fetching contract metadata & findings...');
    const [contractRes, findingsRes] = await Promise.all([
      api.get(`/contracts/${contractId}`),
      api.get(`/contracts/${contractId}/findings`),
    ]);
    const contract = contractRes.contract || contractRes;
    const findings = Array.isArray(findingsRes) ? findingsRes : (findingsRes.findings || []);
    console.log('[Review] 2. Findings received:', findings.length);

    // Update Header Toolbar
    document.getElementById('docTitle').textContent = contract.title || contract.original_filename;
    document.getElementById('pageCountBadge').textContent = `${contract.page_count || 1} pages`;

    // 2. Set findings data in panel
    findingsPanel.setData(contract, findings);

    // 3. Fetch PDF bytes and load into viewer
    console.log('[Review] 3. Fetching PDF blob...');
    const pdfBlob = await api.getBlob(`/contracts/${contractId}/file`);
    console.log('[Review] 4. Got PDF blob, size:', pdfBlob.size);
    const arrayBuffer = await pdfBlob.arrayBuffer();
    console.log('[Review] 5. ArrayBuffer size:', arrayBuffer.byteLength);
    await pdfViewer.loadDocument({ data: new Uint8Array(arrayBuffer) });
    console.log('[Review] 6. Document loaded into pdfViewer!');

    // 4. Set findings in PDF viewer for highlights
    pdfViewer.setFindings(findings);
    console.log('[Review] 7. Highlights set!');
  } catch (err) {
    console.error('[Review] ERROR in associateReview:', err.message, err.stack);
    showToast('Failed to load contract workspace: ' + err.message, 'danger');
    const container = document.getElementById('findingsPanelContainer');
    if (container) {
      container.innerHTML = `
        <div class="alert alert-danger m-3">
          <h5><i class="bi bi-exclamation-triangle-fill me-2"></i>Workspace Error</h5>
          <p>${err.message}</p>
          <a href="/associate/dashboard.html" class="btn btn-outline-danger btn-sm">Return to Dashboard</a>
        </div>
      `;
    }
  }
});

function setupZoomControls() {
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const fitWidthBtn = document.getElementById('fitWidthBtn');
  const zoomLevel = document.getElementById('zoomLevel');

  function updateZoomLabel() {
    zoomLevel.textContent = `${Math.round(currentScale * 100)}%`;
  }

  zoomInBtn.addEventListener('click', async () => {
    if (currentScale < 2.2) {
      currentScale += 0.15;
      updateZoomLabel();
      if (pdfViewer) await pdfViewer.setZoom(currentScale);
    }
  });

  zoomOutBtn.addEventListener('click', async () => {
    if (currentScale > 0.6) {
      currentScale -= 0.15;
      updateZoomLabel();
      if (pdfViewer) await pdfViewer.setZoom(currentScale);
    }
  });

  fitWidthBtn.addEventListener('click', async () => {
    currentScale = 1.15;
    updateZoomLabel();
    if (pdfViewer) await pdfViewer.setZoom(currentScale);
  });
}

function setupReportExport(contractId) {
  const exportBtn = document.getElementById('exportReportBtn');
  if (!exportBtn) return;

  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Exporting...';

    try {
      const token = getToken() || localStorage.getItem('token');
      const res = await fetch(`/api/contracts/${contractId}/report/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Clausify-Executive-Report-${contractId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      showToast('Executive Risk Report PDF downloaded successfully!', 'success');
    } catch (err) {
      showToast('Failed to export executive report: ' + err.message, 'danger');
    } finally {
      exportBtn.disabled = false;
      exportBtn.innerHTML = '<i class="bi bi-file-earmark-pdf"></i> <span class="d-none d-md-inline" style="font-size: 0.75rem;">Export Report</span>';
    }
  });
}
