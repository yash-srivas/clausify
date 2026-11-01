/**
 * PDF Viewer Component - Powered by PDF.js with continuous scroll,
 * text layer rendering, quote highlighting, and interactive click-to-sync.
 */

import { findQuoteMatches } from './quoteMatcher.js';

// Pin worker source to local self-hosted version
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdf.worker.min.js';
}

export class PdfViewer {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      throw new Error(`Container #${containerId} not found`);
    }

    this.options = options;
    this.pdfDoc = null;
    this.scale = options.initialScale || 1.15;
    this.pageRenders = new Map(); // pageNum -> { canvas, textLayer, textItems }
    this.findings = [];
    this.activeFindingId = null;
    this.onFindingClick = options.onFindingClick || null;
  }

  /**
   * Loads and renders a PDF document from an ArrayBuffer, Blob, or URL
   */
  async loadDocument(source) {
    this.container.innerHTML = `
      <div class="d-flex justify-content-center align-items-center py-5 text-muted">
        <div class="spinner-border text-primary me-2" role="status"></div>
        <span>Rendering document pages...</span>
      </div>
    `;

    try {
      console.log('[PdfViewer] Calling pdfjsLib.getDocument...');
      const loadingTask = window.pdfjsLib.getDocument(source);
      console.log('[PdfViewer] Awaiting loadingTask.promise...');
      this.pdfDoc = await loadingTask.promise;
      console.log('[PdfViewer] PDF document loaded, numPages:', this.pdfDoc.numPages);
      this.container.innerHTML = '';

      for (let pageNum = 1; pageNum <= this.pdfDoc.numPages; pageNum++) {
        console.log('[PdfViewer] Rendering page', pageNum);
        await this.renderPage(pageNum);
      }

      console.log('[PdfViewer] All pages rendered, applying highlights...');
      // Re-apply highlights after all pages render
      this.applyAllHighlights();
      console.log('[PdfViewer] Highlights applied successfully!');
    } catch (err) {
      console.error('[PdfViewer] Error loading PDF:', err.message, err.stack);
      this.container.innerHTML = `
        <div class="alert alert-danger m-3">
          <i class="bi bi-exclamation-triangle-fill me-2"></i>
          Failed to load PDF document: ${err.message}
        </div>
      `;
      throw err;
    }
  }

  /**
   * Renders a single page canvas and text layer
   */
  async renderPage(pageNum) {
    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale });

    // Page wrapper
    const pageWrapper = document.createElement('div');
    pageWrapper.className = 'pdf-page-container mb-4 position-relative shadow-sm mx-auto bg-white';
    pageWrapper.id = `pdf-page-${pageNum}`;
    pageWrapper.setAttribute('data-page-number', pageNum);
    pageWrapper.style.width = `${viewport.width}px`;
    pageWrapper.style.height = `${viewport.height}px`;

    // Canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas position-absolute top-0 start-0';
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    pageWrapper.appendChild(canvas);

    const canvasContext = canvas.getContext('2d');
    const renderContext = {
      canvasContext,
      viewport,
    };
    console.log(`[PdfViewer] Page ${pageNum} starting canvas render...`);
    await page.render(renderContext).promise;
    console.log(`[PdfViewer] Page ${pageNum} canvas render done.`);

    // Text Layer
    const textLayerDiv = document.createElement('div');
    textLayerDiv.className = 'textLayer position-absolute top-0 start-0';
    textLayerDiv.style.width = `${viewport.width}px`;
    textLayerDiv.style.height = `${viewport.height}px`;
    textLayerDiv.style.setProperty('--scale-factor', this.scale);
    pageWrapper.appendChild(textLayerDiv);

    this.container.appendChild(pageWrapper);

    console.log(`[PdfViewer] Page ${pageNum} fetching textContent...`);
    const textContent = await page.getTextContent();
    console.log(`[PdfViewer] Page ${pageNum} textContent items:`, textContent.items.length);

    // Render PDF.js text layer spans safely across versions
    try {
      const renderTask = window.pdfjsLib.renderTextLayer({
        textContentSource: textContent,
        textContent: textContent,
        container: textLayerDiv,
        viewport,
        textDivs: [],
      });
      if (renderTask && renderTask.promise) {
        await renderTask.promise;
      } else if (renderTask && typeof renderTask.then === 'function') {
        await renderTask;
      }
      console.log(`[PdfViewer] Page ${pageNum} renderTextLayer done.`);
    } catch (err) {
      console.warn('Text layer render warning:', err.message);
    }

    // Cache rendered elements and text content items
    this.pageRenders.set(pageNum, {
      pageWrapper,
      canvas,
      textLayerDiv,
      textContent,
      items: textContent.items,
    });
  }

  /**
   * Sets findings and applies highlight overlays across pages
   */
  setFindings(findings) {
    this.findings = findings || [];
    this.applyAllHighlights();
  }

  /**
   * Highlights matching text spans on rendered pages
   */
  applyAllHighlights() {
    if (!this.findings || this.findings.length === 0) return;

    this.findings.forEach((finding) => {
      const pageNum = finding.page;
      const pageData = this.pageRenders.get(pageNum);
      if (!pageData || !pageData.items) return;

      const spans = Array.from(pageData.textLayerDiv.children);
      if (spans.length === 0) return;

      // Extract raw items text
      const quote = finding.text_span;
      if (!quote) return;

      const match = findQuoteMatches(pageData.items, quote, { threshold: 0.85 });

      if (match && match.matched && match.itemIndices.length > 0) {
        match.itemIndices.forEach((idx) => {
          const spanEl = spans[idx];
          if (spanEl) {
            spanEl.classList.add('pdf-highlight', `pdf-highlight-${(finding.risk_level || 'medium').toLowerCase()}`);
            spanEl.setAttribute('data-finding-id', finding.id);
            spanEl.setAttribute('data-risk', finding.risk_level);
            spanEl.title = `${finding.clause_type} (${finding.risk_level}): ${finding.reason}`;

            spanEl.style.cursor = 'pointer';
            spanEl.addEventListener('click', (e) => {
              e.stopPropagation();
              if (this.onFindingClick) {
                this.onFindingClick(finding.id);
              }
            });
          }
        });
      }
    });
  }

  /**
   * Scrolls to a specific finding and pulses its highlight
   */
  scrollToFinding(findingId, pageNumber) {
    const pageWrapper = document.getElementById(`pdf-page-${pageNumber}`);
    if (pageWrapper) {
      pageWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Highlight pulse
    const highlights = this.container.querySelectorAll(`[data-finding-id="${findingId}"]`);
    highlights.forEach((el) => {
      el.classList.remove('highlight-pulse');
      // Trigger reflow to restart animation
      void el.offsetWidth;
      el.classList.add('highlight-pulse');
    });

    if (highlights.length > 0) {
      highlights[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /**
   * Change zoom level
   */
  async setZoom(newScale) {
    if (newScale < 0.5 || newScale > 2.5) return;
    this.scale = newScale;
    if (this.pdfDoc) {
      this.pageRenders.clear();
      this.container.innerHTML = '';
      for (let pageNum = 1; pageNum <= this.pdfDoc.numPages; pageNum++) {
        await this.renderPage(pageNum);
      }
      this.applyAllHighlights();
    }
  }
}

export default PdfViewer;

