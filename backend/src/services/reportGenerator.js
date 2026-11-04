const PDFDocument = require('pdfkit');
const db = require('../config/db');

/**
 * Fetches all consolidated data required for an Executive Risk Report
 */
async function getContractReportData(contractId) {
  // 1. Contract metadata
  const contractRes = await db.query(
    `SELECT c.id, c.title, c.original_filename, c.page_count, c.status,
            c.failure_reason, c.overall_risk_score, c.created_at, c.updated_at, c.analyzed_at,
            u.id AS uploader_id, u.name AS uploader_name, u.email AS uploader_email,
            t.id AS template_id, t.name AS template_name, t.version AS template_version
     FROM contracts c
     LEFT JOIN users u ON c.uploaded_by = u.id
     LEFT JOIN templates t ON c.template_id = t.id
     WHERE c.id = $1`,
    [contractId]
  );

  if (contractRes.rows.length === 0) {
    const err = new Error('Contract not found');
    err.status = 404;
    err.code = 'CONTRACT_NOT_FOUND';
    throw err;
  }

  const contract = contractRes.rows[0];

  // 2. Findings
  const findingsRes = await db.query(
    `SELECT f.id, f.clause_type, f.risk_level, f.page, f.text_span,
            f.reason, f.suggested_rewrite, f.source, f.verified, f.status, f.created_at,
            tc.title AS template_clause_title
     FROM findings f
     LEFT JOIN template_clauses tc ON f.template_clause_id = tc.id
     WHERE f.contract_id = $1
     ORDER BY f.page ASC, f.created_at ASC`,
    [contractId]
  );
  const findings = findingsRes.rows;

  // 3. Comments for findings
  const findingIds = findings.map((f) => f.id);
  let commentsByFinding = {};
  if (findingIds.length > 0) {
    const commentsRes = await db.query(
      `SELECT cm.id, cm.finding_id, cm.body, cm.created_at,
              u.name AS user_name, u.role AS user_role
       FROM comments cm
       LEFT JOIN users u ON cm.user_id = u.id
       WHERE cm.finding_id = ANY($1)
       ORDER BY cm.created_at ASC`,
      [findingIds]
    );
    commentsRes.rows.forEach((cm) => {
      if (!commentsByFinding[cm.finding_id]) {
        commentsByFinding[cm.finding_id] = [];
      }
      commentsByFinding[cm.finding_id].push(cm);
    });
  }

  // 4. Partner approval decision
  const approvalRes = await db.query(
    `SELECT a.id, a.decision, a.note, a.decided_at,
            u.name AS decided_by_name, u.role AS decided_by_role
     FROM approvals a
     LEFT JOIN users u ON a.decided_by = u.id
     WHERE a.contract_id = $1
     ORDER BY a.decided_at DESC
     LIMIT 1`,
    [contractId]
  );
  const approval = approvalRes.rows.length > 0 ? approvalRes.rows[0] : null;

  return {
    contract,
    findings: findings.map((f) => ({
      ...f,
      comments: commentsByFinding[f.id] || [],
    })),
    approval,
  };
}

/**
 * Generates a clean, professional executive PDF report streamed directly to outputStream
 */
function buildPdfReport(reportData, outputStream) {
  const { contract, findings, approval } = reportData;

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    bufferPages: true,
    info: {
      Title: `Executive Risk Report - ${contract.title || contract.original_filename}`,
      Author: 'Clausify Legal Risk Analyzer',
      Subject: 'Contract Risk & Benchmark Compliance Audit',
    },
  });

  doc.pipe(outputStream);

  // Palette
  const PRIMARY = '#1E3A8A'; // Deep Navy
  const DARK = '#0F172A';
  const MUTED = '#64748B';
  const LIGHT_BG = '#F8FAFC';
  const BORDER_COLOR = '#E2E8F0';

  const riskColor = (level) => {
    if (level === 'HIGH') return '#DC2626';
    if (level === 'MEDIUM') return '#D97706';
    return '#16A34A';
  };

  // Header Banner
  doc.rect(50, 45, 495, 45).fill('#F1F5F9');
  doc.fillColor(PRIMARY).fontSize(16).font('Helvetica-Bold').text('CLAUSIFY', 65, 55, { continued: true });
  doc.fillColor(MUTED).fontSize(10).font('Helvetica').text('  |  EXECUTIVE CONTRACT RISK REPORT');

  doc.fontSize(8).fillColor(MUTED).text(`GENERATED: ${new Date().toLocaleDateString()} | CONFIDENTIAL`, 65, 73);

  doc.moveDown(3);

  // Contract Metadata Box
  const metaTop = 110;
  doc.roundedRect(50, metaTop, 495, 95, 6).strokeColor(BORDER_COLOR).stroke();

  doc.fillColor(DARK).fontSize(14).font('Helvetica-Bold').text(contract.title || contract.original_filename, 65, metaTop + 14);

  doc.fontSize(9).font('Helvetica').fillColor(MUTED);
  doc.text(`Original File: ${contract.original_filename}`, 65, metaTop + 36);
  doc.text(`Benchmark Template: ${contract.template_name || 'Standard Safe Template'} (v${contract.template_version || 1})`, 65, metaTop + 50);
  doc.text(`Submitted By: ${contract.uploader_name || 'Associate'} (${contract.uploader_email || '--'})`, 65, metaTop + 64);
  doc.text(`Pages Analyzed: ${contract.page_count || 1} pages  |  Status: ${(contract.status || '').toUpperCase()}`, 65, metaTop + 78);

  // Overall Score Badge on the right
  const score = contract.overall_risk_score !== null ? contract.overall_risk_score : 0;
  let band = 'LOW RISK';
  let bandCol = '#16A34A';
  if (score >= 67) {
    band = 'HIGH RISK';
    bandCol = '#DC2626';
  } else if (score >= 34) {
    band = 'MEDIUM RISK';
    bandCol = '#D97706';
  }

  doc.roundedRect(420, metaTop + 14, 110, 68, 6).fill(bandCol);
  doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold').text(`${score}/100`, 420, metaTop + 24, { width: 110, align: 'center' });
  doc.fontSize(9).font('Helvetica-Bold').text(band, 420, metaTop + 52, { width: 110, align: 'center' });

  // Partner Decision Block (if present)
  let currentY = metaTop + 115;
  if (approval) {
    const isApproved = approval.decision === 'approved';
    const decCol = isApproved ? '#16A34A' : approval.decision === 'rejected' ? '#DC2626' : '#D97706';

    doc.roundedRect(50, currentY, 495, 55, 6).fillAndStroke('#F8FAFC', BORDER_COLOR);
    doc.fillColor(decCol).fontSize(10).font('Helvetica-Bold').text(`PARTNER DECISION: ${approval.decision.toUpperCase()}`, 65, currentY + 10);
    doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(`Reviewed by ${approval.decided_by_name || 'Partner'} on ${new Date(approval.decided_at).toLocaleString()}`, 65, currentY + 24);
    if (approval.note) {
      doc.fillColor(DARK).fontSize(9).font('Helvetica-Oblique').text(`"${approval.note}"`, 65, currentY + 36, { width: 460 });
    }
    currentY += 70;
  }

  // Section Header: Executive Findings Summary
  doc.fillColor(PRIMARY).fontSize(12).font('Helvetica-Bold').text('EXECUTIVE RISK FINDINGS SUMMARY', 50, currentY);
  currentY += 18;

  const highCount = findings.filter((f) => f.risk_level === 'HIGH').length;
  const medCount = findings.filter((f) => f.risk_level === 'MEDIUM').length;
  const lowCount = findings.filter((f) => f.risk_level === 'LOW').length;

  doc.fillColor(MUTED).fontSize(9).font('Helvetica').text(
    `Total Issues Detected: ${findings.length}  (High Risk: ${highCount} | Medium Risk: ${medCount} | Low Risk: ${lowCount})`,
    50,
    currentY
  );
  currentY += 20;

  // Findings Breakdown List
  findings.forEach((f, idx) => {
    // Page break check if near bottom
    if (currentY > 680) {
      doc.addPage();
      currentY = 50;
    }

    const findingCol = riskColor(f.risk_level);

    // Finding Card
    doc.roundedRect(50, currentY, 495, 24, 4).fill('#F8FAFC');
    doc.rect(50, currentY, 6, 24).fill(findingCol);

    const clauseTitle = f.clause_type
      ? f.clause_type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      : 'General Clause';

    doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text(`${idx + 1}. ${clauseTitle}`, 65, currentY + 7);
    doc.fillColor(findingCol).fontSize(8).font('Helvetica-Bold').text(`${f.risk_level} RISK`, 370, currentY + 8);
    doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(`Page ${f.page}  |  ${(f.status || 'open').toUpperCase()}`, 435, currentY + 8);

    currentY += 30;

    // Verbatim Quote Block
    doc.roundedRect(65, currentY, 480, doc.heightOfString(`"${f.text_span}"`, { width: 460, font: 'Helvetica-Oblique', size: 8.5 }) + 16, 4)
       .fill('#F1F5F9');

    doc.fillColor(MUTED).fontSize(7.5).font('Helvetica-Bold').text('ORIGINAL CONTRACT EXCERPT:', 75, currentY + 6);
    doc.fillColor(DARK).fontSize(8.5).font('Helvetica-Oblique').text(`"${f.text_span || 'Not extractable'}"`, 75, currentY + 16, { width: 460 });

    currentY += doc.heightOfString(`"${f.text_span}"`, { width: 460, font: 'Helvetica-Oblique', size: 8.5 }) + 24;

    // Risk Rationale
    doc.fillColor(DARK).fontSize(8.5).font('Helvetica-Bold').text('Why This is Risky: ', 65, currentY, { continued: true });
    doc.font('Helvetica').text(f.reason || 'Deviates from corporate safe benchmark standard.');
    currentY += doc.heightOfString(f.reason || '', { width: 480, font: 'Helvetica', size: 8.5 }) + 8;

    // Suggested Safer Rewrite
    if (f.suggested_rewrite) {
      doc.fillColor('#16A34A').fontSize(8.5).font('Helvetica-Bold').text('Suggested Safer Benchmark Rewrite: ', 65, currentY, { continued: true });
      doc.fillColor(DARK).font('Helvetica').text(f.suggested_rewrite);
      currentY += doc.heightOfString(f.suggested_rewrite, { width: 480, font: 'Helvetica', size: 8.5 }) + 8;
    }

    // Reviewer Comments
    if (f.comments && f.comments.length > 0) {
      doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text('Associate Reviewer Comments:', 65, currentY);
      currentY += 12;
      f.comments.forEach((cm) => {
        doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(`- [${cm.user_name || 'Reviewer'}]: "${cm.body}"`, 75, currentY);
        currentY += 12;
      });
    }

    currentY += 14;
  });

  // Footer on all pages
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor(MUTED).text(
      `Clausify Legal Risk Analyzer  |  Confidential Attorney-Client Privileged Work Product  |  Page ${i + 1} of ${range.count}`,
      50,
      785,
      { align: 'center', width: 495 }
    );
  }

  doc.end();
}

module.exports = {
  getContractReportData,
  buildPdfReport,
};

