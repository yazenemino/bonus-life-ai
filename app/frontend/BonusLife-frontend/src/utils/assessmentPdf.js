/**
 * Remove emojis from text for display (e.g. Heart Disease Risk Assessment summaries).
 */
export function stripEmojis(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitize assessment summary for display: remove asterisks (* and **), normalize whitespace,
 * preserve paragraph breaks. Use with formatSummaryForDisplay for organized rendering.
 */
export function sanitizeSummaryForDisplay(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/\*+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Split sanitized summary into paragraphs (double newline) and lines (single newline).
 * Returns array of paragraphs, each paragraph is array of lines (for rendering with <br />).
 */
export function formatSummaryForDisplay(str) {
  const sanitized = sanitizeSummaryForDisplay(str);
  if (!sanitized) return [];
  return sanitized.split(/\n\n+/).map(block => block.split(/\n/).map(line => line.trim()).filter(Boolean));
}

/**
 * Strip characters that pdf-lib StandardFonts (WinAnsi) cannot encode (e.g. emojis).
 * Keeps printable ASCII and Latin-1 supplement (U+0020–U+007E, U+00A0–U+00FF).
 */
function toPdfSafeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Section headers we use to split heart summary (case-insensitive). */
const HEART_PDF_SECTION_HEADERS = [
  'Heart Disease Risk Assessment Summary',
  'When to See a Doctor:',
  'Key Factors:',
  'Key factors:',
  'Immediate Actions:',
  'Immediate Action:',
  'Recommendations:',
  'Executive Summary:',
];

/**
 * Parse heart summary into sections for PDF: strip asterisks, make PDF-safe, then split by known headers.
 * Returns array of { title: string|null, content: string } in order (title null = intro with no heading).
 */
function parseHeartSummaryForPdf(summary) {
  const raw = (summary || 'No summary available.').replace(/\*+/g, '');
  const safe = toPdfSafeText(raw).slice(0, 2000);
  const sections = [];
  let remaining = safe;
  const headers = HEART_PDF_SECTION_HEADERS;
  // Find first occurrence of any header (case-insensitive)
  let found = null;
  let foundIndex = -1;
  let foundLabel = '';
  while (remaining.length > 0) {
    found = null;
    foundIndex = -1;
    foundLabel = '';
    for (const h of headers) {
      const i = remaining.toLowerCase().indexOf(h.toLowerCase());
      if (i >= 0 && (foundIndex < 0 || i < foundIndex)) {
        foundIndex = i;
        foundLabel = remaining.slice(i, i + h.length);
        found = h;
      }
    }
    if (foundIndex < 0) {
      if (remaining.trim()) sections.push({ title: null, content: remaining.trim() });
      break;
    }
    if (foundIndex > 0) {
      const intro = remaining.slice(0, foundIndex).trim();
      if (intro) sections.push({ title: null, content: intro });
    }
    remaining = remaining.slice(foundIndex + foundLabel.length).trim();
    const nextIdx = remaining.length;
    let nextHeaderIdx = -1;
    for (const h of headers) {
      const i = remaining.toLowerCase().indexOf(h.toLowerCase());
      if (i >= 0 && (nextHeaderIdx < 0 || i < nextHeaderIdx)) nextHeaderIdx = i;
    }
    const content = nextHeaderIdx >= 0 ? remaining.slice(0, nextHeaderIdx).trim() : remaining;
    if (content) sections.push({ title: foundLabel, content });
    remaining = nextHeaderIdx >= 0 ? remaining.slice(nextHeaderIdx) : '';
  }
  return sections;
}

/**
 * Build and download signed assessment PDF. Used by Dashboard and AssessmentReportPage.
 * @param {Object} assessment - assessment object
 * @param {Object} user - current user (full_name, email)
 * @param {boolean} isTr - Turkish locale
 * @param {Object} apiService - api service with signAssessmentReport
 */
export async function buildAndDownloadSignedPDF(assessment, user, isTr, apiService) {
  const signResult = await apiService.signAssessmentReport(assessment.id);
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const QRCode = (await import('qrcode')).default;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  let y = height - 50;

  page.drawText('Diabetes Risk Assessment Report', { x: 50, y, font: fontBold, size: 16, color: rgb(0.02, 0.6, 0.4) });
  y -= 24;
  const date = toPdfSafeText(assessment.created_at ? new Date(assessment.created_at).toLocaleString() : 'N/A');
  page.drawText(`Date: ${date}`, { x: 50, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 18;
  page.drawText(`Patient: ${toPdfSafeText(user?.full_name || user?.email || 'N/A')}`, { x: 50, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 18;
  page.drawText(`Risk Level: ${toPdfSafeText(assessment.risk_level || 'Unknown')}  |  Probability: ${((assessment.probability || 0) * 100).toFixed(1)}%`, { x: 50, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 18;

  const leftMargin = 50;
  const rightMargin = 70;
  const maxW = width - leftMargin - rightMargin;
  const lineH = 12;
  const charsPerLine = 72;
  const wordBreaks = [' '];
  const redBold = { font: fontBold, size: 10, color: rgb(0.75, 0.1, 0.1) };
  const normalText = { font, size: 10, color: rgb(0.3, 0.3, 0.3) };
  const rawSummary = toPdfSafeText((assessment.executive_summary || 'No summary available.').replace(/\*\*/g, '').trim());
  const withSpacing = rawSummary.replace(/\s*(Immediate Lifestyle Recommendations:)/gi, '\n\n\n$1').slice(0, 1200);
  const headingLabel = 'Immediate Lifestyle Recommendations:';
  const execSummaryLabel = 'Executive Summary:';
  const headingIdx = withSpacing.toLowerCase().indexOf(headingLabel.toLowerCase());
  const execSummaryIdx = withSpacing.toLowerCase().indexOf(execSummaryLabel.toLowerCase());
  page.drawText('Summary:', { x: leftMargin, y, font: fontBold, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 14;

  if (headingIdx >= 0) {
    const part1 = withSpacing.slice(0, headingIdx).trim();
    const part2 = withSpacing.slice(headingIdx + headingLabel.length).trim();
    if (part1) {
      if (execSummaryIdx >= 0 && execSummaryIdx < headingIdx) {
        const part1a = part1.slice(0, execSummaryIdx).trim();
        const part1b = part1.slice(execSummaryIdx + execSummaryLabel.length).trim();
        if (part1a) {
          page.drawText(part1a, { x: leftMargin, y, ...normalText, maxWidth: maxW, lineHeight: lineH, wordBreaks });
          y -= Math.max(1, Math.ceil(part1a.length / charsPerLine)) * lineH;
        }
        page.drawText(execSummaryLabel, { x: leftMargin, y, ...redBold });
        y -= lineH;
        if (part1b) {
          page.drawText(part1b, { x: leftMargin, y, ...normalText, maxWidth: maxW, lineHeight: lineH, wordBreaks });
          y -= Math.max(1, Math.ceil(part1b.length / charsPerLine)) * lineH;
        }
      } else {
        page.drawText(part1, { x: leftMargin, y, ...normalText, maxWidth: maxW, lineHeight: lineH, wordBreaks });
        y -= Math.max(1, Math.ceil(part1.length / charsPerLine)) * lineH;
      }
    }
    y -= 18;
    page.drawText(headingLabel, { x: leftMargin, y, ...redBold });
    y -= lineH;
    if (part2) {
      page.drawText(part2, { x: leftMargin, y, ...normalText, maxWidth: maxW, lineHeight: lineH, wordBreaks });
      y -= Math.max(1, Math.ceil(part2.length / charsPerLine)) * lineH;
    }
  } else {
    if (execSummaryIdx >= 0) {
      const partA = withSpacing.slice(0, execSummaryIdx).trim();
      const partB = withSpacing.slice(execSummaryIdx + execSummaryLabel.length).trim();
      if (partA) {
        page.drawText(partA, { x: leftMargin, y, ...normalText, maxWidth: maxW, lineHeight: lineH, wordBreaks });
        y -= Math.max(1, Math.ceil(partA.length / charsPerLine)) * lineH;
      }
      page.drawText(execSummaryLabel, { x: leftMargin, y, ...redBold });
      y -= lineH;
      if (partB) {
        page.drawText(partB, { x: leftMargin, y, ...normalText, maxWidth: maxW, lineHeight: lineH, wordBreaks });
        y -= Math.max(1, Math.ceil(partB.length / charsPerLine)) * lineH;
      }
    } else {
      page.drawText(withSpacing, { x: leftMargin, y, ...normalText, maxWidth: maxW, lineHeight: lineH, wordBreaks });
      y -= Math.max(1, Math.ceil(withSpacing.length / charsPerLine)) * lineH;
    }
  }
  y -= 24;

  const qrPayload = JSON.stringify({
    report_id: signResult.report_id,
    issued_at: signResult.issued_at,
    assessment_db_id: signResult.assessment_db_id,
    payload_hash: signResult.payload_hash,
    signature_b64: signResult.signature_b64,
    alg: signResult.alg,
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 140, margin: 1 });
  const base64 = qrDataUrl.split(',')[1];
  const qrBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const qrImage = await doc.embedPng(qrBytes);
  page.drawImage(qrImage, { x: 50, y: y - 130, width: 120, height: 120 });
  page.drawText('Scan QR to verify signature', { x: 50, y: y - 142, font, size: 8, color: rgb(0.5, 0.5, 0.5) });

  y -= 165;
  const medicalStatements = [
    'This report is for informational purposes only. Clinical decisions should be made in consultation with a qualified healthcare provider.',
    'Results should be interpreted by a licensed healthcare professional in the context of the full clinical picture.',
    'This assessment does not replace professional medical advice, diagnosis, or treatment.',
    'For clinical use only. Interpretation by a qualified healthcare provider is recommended.',
    'This document supports but does not substitute a comprehensive medical evaluation by your physician.',
    'Findings are indicative only. Please consult your healthcare provider for personalized medical advice.',
    'Generated by Bonus Life AI. This tool aids awareness; a healthcare professional should guide any treatment decisions.',
  ];
  const statementIndex = signResult.report_id.split('').reduce((acc, c) => (acc + c.charCodeAt(0)) % medicalStatements.length, 0);
  const medicalStatement = medicalStatements[statementIndex];
  page.drawText(medicalStatement, { x: 50, y, font, size: 8, color: rgb(0.45, 0.45, 0.5), maxWidth: width - 100 });

  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `assessment-${assessment.id}-signed.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Build and download signed heart assessment PDF.
 * @param {Object} assessment - heart assessment object (id, risk_level, probability, executive_summary, created_at)
 * @param {Object} user - current user (full_name, email)
 * @param {boolean} isTr - Turkish locale
 * @param {Object} apiService - api service with signHeartAssessmentReport
 */
export async function buildAndDownloadSignedHeartPDF(assessment, user, isTr, apiService) {
  const signResult = await apiService.signHeartAssessmentReport(assessment.id);
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const QRCode = (await import('qrcode')).default;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  let y = height - 50;

  page.drawText('Heart Disease Risk Assessment Report', { x: 50, y, font: fontBold, size: 16, color: rgb(0.9, 0.2, 0.4) });
  y -= 24;
  const date = toPdfSafeText(assessment.created_at ? new Date(assessment.created_at).toLocaleString() : 'N/A');
  page.drawText(`Date: ${date}`, { x: 50, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 18;
  page.drawText(`Patient: ${toPdfSafeText(user?.full_name || user?.email || 'N/A')}`, { x: 50, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 18;
  page.drawText(`Risk Level: ${toPdfSafeText(assessment.risk_level || 'Unknown')}  |  Probability: ${((assessment.probability || 0) * 100).toFixed(1)}%`, { x: 50, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 24;

  const leftMargin = 50;
  const rightMargin = 70;
  const maxW = width - leftMargin - rightMargin;
  const lineH = 12;
  const charsPerLine = 72;
  const wordBreaks = [' '];
  const normalText = { font, size: 10, color: rgb(0.3, 0.3, 0.3) };
  const sectionTitleStyle = { font: fontBold, size: 10, color: rgb(0.5, 0.2, 0.35) };
  const sections = parseHeartSummaryForPdf(assessment.executive_summary);
  page.drawText('Summary:', { x: leftMargin, y, font: fontBold, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 14;
  for (const { title, content } of sections) {
    if (!content) continue;
    if (title) {
      page.drawText(title, { x: leftMargin, y, ...sectionTitleStyle });
      y -= lineH;
    }
    page.drawText(content, { x: leftMargin, y, ...normalText, maxWidth: maxW, lineHeight: lineH, wordBreaks });
    y -= Math.max(1, Math.ceil(content.length / charsPerLine)) * lineH;
    y -= title ? 10 : 6;
  }
  y -= 16;

  const qrPayload = JSON.stringify({
    report_id: signResult.report_id,
    issued_at: signResult.issued_at,
    assessment_db_id: signResult.assessment_db_id,
    payload_hash: signResult.payload_hash,
    signature_b64: signResult.signature_b64,
    alg: signResult.alg,
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 140, margin: 1 });
  const base64 = qrDataUrl.split(',')[1];
  const qrBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const qrImage = await doc.embedPng(qrBytes);
  page.drawImage(qrImage, { x: 50, y: y - 130, width: 120, height: 120 });
  page.drawText('Scan QR to verify signature', { x: 50, y: y - 142, font, size: 8, color: rgb(0.5, 0.5, 0.5) });

  y -= 165;
  const medicalStatements = [
    'This report is for informational purposes only. Clinical decisions should be made in consultation with a qualified healthcare provider.',
    'Results should be interpreted by a licensed healthcare professional in the context of the full clinical picture.',
    'This assessment does not replace professional medical advice, diagnosis, or treatment.',
    'For clinical use only. Interpretation by a qualified healthcare provider is recommended.',
    'Generated by Bonus Life AI. This tool aids awareness; a healthcare professional should guide any treatment decisions.',
  ];
  const statementIndex = signResult.report_id.split('').reduce((acc, c) => (acc + c.charCodeAt(0)) % medicalStatements.length, 0);
  const medicalStatement = medicalStatements[statementIndex];
  page.drawText(medicalStatement, { x: 50, y, font, size: 8, color: rgb(0.45, 0.45, 0.5), maxWidth: width - 100 });

  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `heart-assessment-${assessment.id}-signed.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Section headers we use to split CKD summary. */
const CKD_PDF_SECTION_HEADERS = [
  'CKD Assessment Summary',
  'Clinical Summary:',
  'Key Findings:',
  'Key findings:',
  'Risk Factors:',
  'Risk factors:',
  'Recommendations:',
  'Executive Summary:',
  'Immediate Actions:',
];

function parseCKDSummaryForPdf(summary) {
  const raw = (summary || 'No summary available.').replace(/\*+/g, '');
  const safe = toPdfSafeText(raw).slice(0, 2000);
  const sections = [];
  let remaining = safe;
  const headers = CKD_PDF_SECTION_HEADERS;
  while (remaining.length > 0) {
    let foundIndex = -1;
    let foundLabel = '';
    let found = null;
    for (const h of headers) {
      const i = remaining.toLowerCase().indexOf(h.toLowerCase());
      if (i >= 0 && (foundIndex < 0 || i < foundIndex)) {
        foundIndex = i;
        foundLabel = remaining.slice(i, i + h.length);
        found = h;
      }
    }
    if (foundIndex < 0) {
      if (remaining.trim()) sections.push({ title: null, content: remaining.trim() });
      break;
    }
    if (foundIndex > 0) {
      const intro = remaining.slice(0, foundIndex).trim();
      if (intro) sections.push({ title: null, content: intro });
    }
    remaining = remaining.slice(foundIndex + foundLabel.length).trim();
    let nextHeaderIdx = -1;
    for (const h of headers) {
      const i = remaining.toLowerCase().indexOf(h.toLowerCase());
      if (i >= 0 && (nextHeaderIdx < 0 || i < nextHeaderIdx)) nextHeaderIdx = i;
    }
    const content = nextHeaderIdx >= 0 ? remaining.slice(0, nextHeaderIdx).trim() : remaining;
    if (content) sections.push({ title: foundLabel, content });
    remaining = nextHeaderIdx >= 0 ? remaining.slice(nextHeaderIdx) : '';
  }
  return sections;
}

/**
 * Build and download signed CKD assessment PDF.
 * @param {Object} assessment - CKD assessment object (id, prediction, confidence, executive_summary, created_at)
 * @param {Object} user - current user (full_name, email)
 * @param {boolean} isTr - Turkish locale
 * @param {Object} apiService - api service with signCKDAssessmentReport
 */
export async function buildAndDownloadSignedCKDPDF(assessment, user, isTr, apiService) {
  const signResult = await apiService.signCKDAssessmentReport(assessment.id);
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const QRCode = (await import('qrcode')).default;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  let y = height - 50;

  page.drawText('Chronic Kidney Disease (CKD) Assessment Report', { x: 50, y, font: fontBold, size: 16, color: rgb(0.0, 0.54, 0.70) });
  y -= 24;
  const date = toPdfSafeText(assessment.created_at ? new Date(assessment.created_at).toLocaleString() : 'N/A');
  page.drawText(`Date: ${date}`, { x: 50, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 18;
  page.drawText(`Patient: ${toPdfSafeText(user?.full_name || user?.email || 'N/A')}`, { x: 50, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 18;
  const predColor = (assessment.prediction || '').toLowerCase().includes('no') ? rgb(0.05, 0.55, 0.35) : rgb(0.8, 0.1, 0.1);
  page.drawText(`CKD Status: ${toPdfSafeText(assessment.prediction || 'Unknown')}  |  Confidence: ${((assessment.confidence || 0) * 100).toFixed(1)}%`, { x: 50, y, font, size: 11, color: predColor });
  y -= 24;

  const leftMargin = 50;
  const rightMargin = 70;
  const maxW = width - leftMargin - rightMargin;
  const lineH = 12;
  const charsPerLine = 72;
  const wordBreaks = [' '];
  const normalText = { font, size: 10, color: rgb(0.3, 0.3, 0.3) };
  const sectionTitleStyle = { font: fontBold, size: 10, color: rgb(0.0, 0.40, 0.55) };

  const sections = parseCKDSummaryForPdf(assessment.executive_summary);
  page.drawText('Clinical Summary:', { x: leftMargin, y, font: fontBold, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 14;
  for (const { title, content } of sections) {
    if (!content) continue;
    if (title) {
      page.drawText(title, { x: leftMargin, y, ...sectionTitleStyle });
      y -= lineH;
    }
    page.drawText(content, { x: leftMargin, y, ...normalText, maxWidth: maxW, lineHeight: lineH, wordBreaks });
    y -= Math.max(1, Math.ceil(content.length / charsPerLine)) * lineH;
    y -= title ? 10 : 6;
  }
  y -= 16;

  const qrPayload = JSON.stringify({
    report_id: signResult.report_id,
    issued_at: signResult.issued_at,
    assessment_db_id: signResult.assessment_db_id,
    payload_hash: signResult.payload_hash,
    signature_b64: signResult.signature_b64,
    alg: signResult.alg,
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 140, margin: 1 });
  const base64 = qrDataUrl.split(',')[1];
  const qrBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const qrImage = await doc.embedPng(qrBytes);
  page.drawImage(qrImage, { x: 50, y: y - 130, width: 120, height: 120 });
  page.drawText('Scan QR to verify signature', { x: 50, y: y - 142, font, size: 8, color: rgb(0.5, 0.5, 0.5) });

  y -= 165;
  const medicalStatements = [
    'This report is for informational purposes only. Clinical decisions should be made in consultation with a qualified healthcare provider.',
    'Results should be interpreted by a licensed healthcare professional in the context of the full clinical picture.',
    'This assessment does not replace professional medical advice, diagnosis, or treatment.',
    'For clinical use only. Interpretation by a qualified healthcare provider is recommended.',
    'Generated by Bonus Life AI. This tool aids awareness; a healthcare professional should guide any treatment decisions.',
  ];
  const statementIndex = signResult.report_id.split('').reduce((acc, c) => (acc + c.charCodeAt(0)) % medicalStatements.length, 0);
  page.drawText(medicalStatements[statementIndex], { x: 50, y, font, size: 8, color: rgb(0.45, 0.45, 0.5), maxWidth: width - 100 });

  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ckd-assessment-${assessment.id}-signed.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Detect Arabic-script characters. pdf-lib's built-in StandardFonts (WinAnsi encoding)
 * cannot represent or shape Arabic glyphs, so text containing them must be rasterized
 * (see rasterizeRtlText) instead of drawn with page.drawText.
 */
function containsArabic(str) {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/.test(str || '');
}

/**
 * Render RTL/Arabic text to a PNG via an offscreen canvas, using the browser's native
 * text engine for correct Arabic letter joining and right-to-left ordering (pdf-lib has
 * no complex text shaping of its own). Returns a PNG data URL plus its size in PDF points.
 */
function rasterizeRtlText(text, { maxWidthPt, fontSizePt = 10, lineHeightPt = 14, color = '#4d4d4d', scale = 3 }) {
  const words = text.split(/\s+/).filter(Boolean);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const fontFamily = "'Segoe UI', Tahoma, Arial, sans-serif";
  const fontPx = fontSizePt * scale;
  const maxWidthPx = maxWidthPt * scale;
  ctx.font = `${fontPx}px ${fontFamily}`;

  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidthPx) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) return null;

  const lineHeightPx = lineHeightPt * scale;
  const paddingPx = 4 * scale;
  canvas.width = Math.ceil(maxWidthPx) + paddingPx * 2;
  canvas.height = Math.ceil(lines.length * lineHeightPx) + paddingPx * 2;

  // Resizing the canvas resets its 2D context state, so re-apply settings.
  ctx.font = `${fontPx}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    ctx.fillText(line, canvas.width - paddingPx, paddingPx + (i + 1) * lineHeightPx - lineHeightPx * 0.3);
  });

  return {
    dataUrl: canvas.toDataURL('image/png'),
    widthPt: canvas.width / scale,
    heightPt: canvas.height / scale,
  };
}

/**
 * Draw a block of text at (x, y), automatically rasterizing it instead when it contains
 * Arabic script (see rasterizeRtlText). Returns the new y cursor position.
 */
async function drawDirectionAwareText(doc, page, text, { x, y, maxWidth, font, fontSize = 10, lineHeight = 12, charsPerLine = 72, pdfColor, cssColor = '#4d4d4d' }) {
  if (!text) return y;
  if (containsArabic(text)) {
    const rasterized = rasterizeRtlText(text, { maxWidthPt: maxWidth, fontSizePt: fontSize, lineHeightPt: lineHeight, color: cssColor });
    if (!rasterized) return y;
    const base64 = rasterized.dataUrl.split(',')[1];
    const pngBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const pngImage = await doc.embedPng(pngBytes);
    page.drawImage(pngImage, { x, y: y - rasterized.heightPt, width: rasterized.widthPt, height: rasterized.heightPt });
    return y - rasterized.heightPt;
  }
  page.drawText(text, { x, y, font, size: fontSize, color: pdfColor, maxWidth, lineHeight, wordBreaks: [' '] });
  return y - Math.max(1, Math.ceil(text.length / charsPerLine)) * lineHeight;
}

/**
 * Parse Brain MRI summary
 */
export function parseMriSummaryForPdf(summary) {
  const raw = (summary || 'No summary available.').replace(/\*+/g, '');
  // Arabic text must not go through toPdfSafeText — it strips all non-Latin-1 characters,
  // which would blank out every Arabic word and leave only stray punctuation behind.
  const safe = (containsArabic(raw) ? raw.replace(/\s+/g, ' ').trim() : toPdfSafeText(raw)).slice(0, 2000);
  // Just split by double newline as sections might not have predictable headers
  const parts = safe.split(/\n\s*\n/).filter(p => p.trim());
  return parts.map((content) => ({ title: null, content: content.trim() }));
}

/**
 * Build and download signed MRI assessment PDF.
 */
export async function buildAndDownloadSignedMriPDF(assessment, user, isTr, apiService) {
  const signResult = await apiService.signMriAssessmentReport(assessment.id);
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const QRCode = (await import('qrcode')).default;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595, 842]);
  const { width, height } = page.getSize();
  let y = height - 50;

  page.drawText('Brain Neurological MRI Report', { x: 50, y, font: fontBold, size: 16, color: rgb(0.35, 0.2, 0.6) });
  y -= 24;
  const date = toPdfSafeText(assessment.created_at ? new Date(assessment.created_at).toLocaleString() : 'N/A');
  page.drawText(`Date: ${date}`, { x: 50, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 18;
  page.drawText(`Patient: ${toPdfSafeText(user?.full_name || user?.email || 'N/A')}`, { x: 50, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 18;
  // risk_analysis is the raw shape returned by POST /brain-mri-analysis; top-level
  // tumor_class/confidence is the flattened shape used when viewing a saved assessment
  // from the dashboard. Read both so classification/confidence never silently fall back
  // to "Unknown"/"N/A" just because one code path was used instead of the other.
  const tumorClass = assessment.tumor_class ?? assessment.risk_analysis?.tumor_class;
  const confidence = assessment.confidence ?? assessment.risk_analysis?.confidence;
  page.drawText(`AI Classification: ${toPdfSafeText(tumorClass || 'Unknown')}  |  Confidence: ${confidence != null ? (confidence * 100).toFixed(1) + '%' : 'N/A'}`, { x: 50, y, font, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 24;

  const leftMargin = 50;
  const rightMargin = 70;
  const maxW = width - leftMargin - rightMargin;
  const lineH = 12;
  const normalTextColor = rgb(0.3, 0.3, 0.3);

  const sections = parseMriSummaryForPdf(assessment.executive_summary);
  page.drawText('Clinical Summary:', { x: leftMargin, y, font: fontBold, size: 11, color: rgb(0.2, 0.2, 0.2) });
  y -= 14;
  for (const { content } of sections) {
    if (!content) continue;
    y = await drawDirectionAwareText(doc, page, content, {
      x: leftMargin, y, maxWidth: maxW, font, fontSize: 10, lineHeight: lineH, pdfColor: normalTextColor,
    });
    y -= 6;
  }
  y -= 16;

  const qrPayload = JSON.stringify({
    report_id: signResult.report_id,
    issued_at: signResult.issued_at,
    assessment_db_id: signResult.assessment_db_id,
    payload_hash: signResult.payload_hash,
    signature_b64: signResult.signature_b64,
    alg: signResult.alg,
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 140, margin: 1 });
  const base64 = qrDataUrl.split(',')[1];
  const qrBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const qrImage = await doc.embedPng(qrBytes);
  page.drawImage(qrImage, { x: 50, y: y - 130, width: 120, height: 120 });
  page.drawText('Scan QR to verify signature', { x: 50, y: y - 142, font, size: 8, color: rgb(0.5, 0.5, 0.5) });

  y -= 165;
  const medicalStatements = [
    'This report is for informational purposes only. Clinical decisions should be made in consultation with a qualified healthcare provider.',
    'Results should be interpreted by a licensed healthcare professional in the context of the full clinical picture.',
    'This assessment does not replace professional medical advice, diagnosis, or treatment.',
    'For clinical use only. Interpretation by a qualified healthcare provider is recommended.',
    'Generated by Bonus Life AI. This tool aids awareness; a healthcare professional should guide any treatment decisions.',
  ];
  const statementIndex = signResult.report_id.split('').reduce((acc, c) => (acc + c.charCodeAt(0)) % medicalStatements.length, 0);
  const medicalStatement = medicalStatements[statementIndex];
  page.drawText(medicalStatement, { x: 50, y, font, size: 8, color: rgb(0.45, 0.45, 0.5), maxWidth: width - 100 });

  const pdfBytes = await doc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brain-mri-${assessment.id}-signed.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
