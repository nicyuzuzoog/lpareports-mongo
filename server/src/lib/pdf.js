import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(__dirname, '../assets/logo.jpeg');

const COLORS = {
  navy: '#123a63',
  green: '#1f7a4d',
  ink: '#1b2430',
  muted: '#5c6b7a',
  line: '#dfe5ec',
  light: '#f4f6f8',
  white: '#ffffff',
  amber: '#a35c00',
  rwandaYellow: '#f7d117',
  rwandaGreen: '#006600',
  rwandaRed: '#c8102e'
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 40,
  contentWidth: 515.28
};

const LEVEL_TITLES = {
  NURSERY: 'Nursery',
  LOWER_PRIMARY: 'Lower Primary',
  UPPER_PRIMARY: 'Upper Primary'
};

const ROW_HEIGHT = 16;

/** Rwandan grade colours: A/B green, C/D normal, E/S/F warning. */
function gradeColor(grade) {
  if (grade === 'A' || grade === 'B') return COLORS.green;
  if (['E', 'S', 'F'].includes(grade)) return COLORS.amber;
  return COLORS.ink;
}

function band(doc, y, text, height = 20) {
  doc.rect(PAGE.margin, y, PAGE.contentWidth, height).fill(COLORS.navy);
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(COLORS.white)
    .text(text, PAGE.margin, y + 5.5, { width: PAGE.contentWidth, align: 'center', lineBreak: false });
  return y + height;
}

function drawSchoolHeader(doc, payload, settings) {
  const school = payload.school || {};
  const schoolName = school.campusName || school.name || settings?.schoolName || 'LIGHT PEACE ACADEMY';
  const address = school.address || school.campusLocation || '';
  const motto = school.motto || settings?.schoolMotto || '';
  let textX = PAGE.margin;
  let textWidth = PAGE.contentWidth;

  if (fs.existsSync(LOGO_PATH)) {
    try {
      doc.image(LOGO_PATH, PAGE.margin, 30, { fit: [46, 46] });
      textX = PAGE.margin + 56;
      textWidth = PAGE.contentWidth - 56;
    } catch (error) {
      // Corrupt logo: fall back to a text-only header.
    }
  }

  doc.fillColor(COLORS.navy).font('Helvetica-Bold')
    .fontSize(schoolName.length > 24 ? 14 : 17)
    .text(String(schoolName).toUpperCase(), textX, 31, {
      width: textWidth,
      align: 'center',
      lineBreak: false
    });
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.green)
    .text(motto, textX, 52, { width: textWidth, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(7.2).fillColor(COLORS.muted)
    .text(`${address}  |  Tel: ${school.phone || '-'}  |  ${school.email || '-'}`, textX, 64, {
      width: textWidth,
      align: 'center',
      lineBreak: false
    });
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.muted)
    .text('OFFICE OF THE HEAD TEACHER', textX, 76, {
      width: textWidth,
      align: 'center',
      lineBreak: false
    });

  // Thin Rwandan-colour accent line.
  doc.moveTo(PAGE.margin, 91).lineTo(PAGE.margin + PAGE.contentWidth, 91)
    .lineWidth(1.2).stroke(COLORS.rwandaYellow);
  doc.moveTo(PAGE.margin, 93).lineTo(PAGE.margin + PAGE.contentWidth, 93)
    .lineWidth(1.2).stroke(COLORS.rwandaGreen);
  doc.moveTo(PAGE.margin, 95).lineTo(PAGE.margin + PAGE.contentWidth, 95)
    .lineWidth(1.2).stroke(COLORS.rwandaRed);
  return 104;
}

function studentPanel(doc, payload, y) {
  const position = payload.summary?.position;
  const rows = [
    ['STUDENT NAME', payload.student?.fullName || payload.student?.name || '-', 'STUDENT ID', payload.student?.code || '-'],
    [
      'CLASS',
      payload.className || payload.student?.className || '-',
      'GENDER',
      payload.student?.gender === 'FEMALE' ? 'Female' : payload.student?.gender === 'MALE' ? 'Male' : '-'
    ],
    [
      'POSITION',
      position ? `${position} / ${payload.summary?.outOf ?? '-'}` : '- / -',
      'AVERAGE',
      payload.summary?.average === null || payload.summary?.average === undefined
        ? '-'
        : `${payload.summary.average}%`
    ]
  ];

  const height = 66;
  doc.rect(PAGE.margin, y, PAGE.contentWidth, height).fill(COLORS.light);
  doc.rect(PAGE.margin, y, 3, height).fill(COLORS.green);
  const colWidth = PAGE.contentWidth / 2;

  rows.forEach((row, index) => {
    const rowY = y + 8 + index * 19;
    doc.font('Helvetica-Bold').fontSize(6.4).fillColor(COLORS.muted)
      .text(row[0], PAGE.margin + 12, rowY, { width: 76, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.6).fillColor(COLORS.ink)
      .text(String(row[1] || '-'), PAGE.margin + 90, rowY - 1.5, {
        width: colWidth - 100,
        lineBreak: false,
        ellipsis: true
      });
    doc.font('Helvetica-Bold').fontSize(6.4).fillColor(COLORS.muted)
      .text(row[2], PAGE.margin + colWidth + 8, rowY, { width: 76, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.6).fillColor(COLORS.ink)
      .text(String(row[3] || '-'), PAGE.margin + colWidth + 86, rowY - 1.5, {
        width: colWidth - 96,
        lineBreak: false,
        ellipsis: true
      });
  });
  return y + height;
}

function drawColumns(doc, columns, y, height = 18) {
  const xs = [];
  let cursor = PAGE.margin;
  columns.forEach((column) => {
    xs.push(cursor);
    cursor += column.width;
  });
  doc.rect(PAGE.margin, y, PAGE.contentWidth, height).fill(COLORS.navy);
  columns.forEach((column, index) => {
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(COLORS.white)
      .text(column.label, xs[index] + 3, y + 5.5, {
        width: column.width - 6,
        align: column.align || 'center',
        lineBreak: false
      });
  });
  return { xs, y: y + height };
}

function cell(doc, text, x, y, width, align, options = {}) {
  doc.font(options.font || 'Helvetica')
    .fontSize(options.size || 7.4)
    .fillColor(options.color || COLORS.ink)
    .text(String(text ?? '-'), x + 3, y + 4.5, {
      width: width - 6,
      align: align || 'center',
      lineBreak: false,
      ellipsis: true
    });
}

function subjectTable(doc, payload, startY) {
  const isMidterm = payload.type === 'MIDTERM';
  const columns = isMidterm
    ? [
        { label: 'No', width: 30, align: 'center' },
        { label: 'Subject', width: 275, align: 'left' },
        { label: 'Mid-term', width: 90, align: 'center' },
        { label: 'Grade', width: 120.28, align: 'center' }
      ]
    : [
        { label: 'No', width: 26, align: 'center' },
        { label: 'Subject', width: 184, align: 'left' },
        { label: 'Mid-term', width: 76, align: 'center' },
        { label: 'End-term', width: 76, align: 'center' },
        { label: 'Total', width: 62, align: 'center' },
        { label: 'Grade', width: 91.28, align: 'center' }
      ];

  const header = drawColumns(doc, columns, startY);
  let y = header.y;
  const marks = payload.marks || [];

  marks.forEach((mark, index) => {
    if (index % 2 === 1) doc.rect(PAGE.margin, y, PAGE.contentWidth, ROW_HEIGHT).fill(COLORS.light);
    doc.rect(PAGE.margin, y, PAGE.contentWidth, ROW_HEIGHT).lineWidth(0.35).stroke(COLORS.line);

    const values = isMidterm
      ? [index + 1, mark.subject, mark.midtermScore ?? '-', mark.grade || '-']
      : [
          index + 1,
          mark.subject,
          mark.midtermScore ?? '-',
          mark.examScore ?? '-',
          mark.total ?? '-',
          mark.grade || '-'
        ];
    values.forEach((value, columnIndex) => {
      const column = columns[columnIndex];
      const isGrade = columnIndex === values.length - 1;
      cell(doc, value, header.xs[columnIndex], y, column.width, column.align, {
        font: columnIndex === 1 ? 'Helvetica-Bold' : 'Helvetica',
        color: isGrade ? gradeColor(mark.grade) : COLORS.ink
      });
    });
    y += ROW_HEIGHT;
  });

  if (!marks.length) {
    doc.rect(PAGE.margin, y, PAGE.contentWidth, 26).lineWidth(0.35).stroke(COLORS.line);
    doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(COLORS.muted)
      .text('No assessment scores recorded.', PAGE.margin, y + 8, {
        width: PAGE.contentWidth,
        align: 'center',
        lineBreak: false
      });
    y += 26;
  }
  return y;
}

function annualTable(doc, payload, startY) {
  const columns = [
    { label: 'Term', width: 170, align: 'left' },
    { label: 'Average', width: 115, align: 'center' },
    { label: 'Grade', width: 115, align: 'center' },
    { label: 'Position', width: 115.28, align: 'center' }
  ];
  const header = drawColumns(doc, columns, startY);
  let y = header.y;
  const terms = payload.annual?.terms || [];

  terms.forEach((term, index) => {
    if (index % 2 === 1) doc.rect(PAGE.margin, y, PAGE.contentWidth, ROW_HEIGHT).fill(COLORS.light);
    doc.rect(PAGE.margin, y, PAGE.contentWidth, ROW_HEIGHT).lineWidth(0.35).stroke(COLORS.line);
    const values = [
      term.label || term.term,
      term.average === null || term.average === undefined ? '-' : `${term.average}%`,
      term.grade || '-',
      term.position ? `${term.position} / ${term.outOf ?? '-'}` : '- / -'
    ];
    values.forEach((value, columnIndex) => {
      const column = columns[columnIndex];
      cell(doc, value, header.xs[columnIndex], y, column.width, column.align, {
        font: columnIndex === 0 ? 'Helvetica-Bold' : 'Helvetica',
        color: columnIndex === 2 ? gradeColor(term.grade) : COLORS.ink
      });
    });
    y += ROW_HEIGHT;
  });

  const annual = payload.annual || {};
  y += 10;
  const height = 40;
  doc.rect(PAGE.margin, y, PAGE.contentWidth, height).fill('#eef3f8');
  doc.rect(PAGE.margin, y, 3, height).fill(COLORS.navy);
  const cells = [
    ['OVERALL AVERAGE', annual.overallAverage === null || annual.overallAverage === undefined ? '-' : `${annual.overallAverage}%`, COLORS.navy],
    ['POSITION', annual.overallPosition ? `${annual.overallPosition} / ${annual.overallOutOf ?? '-'}` : '- / -', COLORS.navy],
    ['GRADE', annual.overallGrade || '-', gradeColor(annual.overallGrade)]
  ];
  const cellWidth = PAGE.contentWidth / cells.length;
  cells.forEach(([label, value, color], index) => {
    const x = PAGE.margin + index * cellWidth;
    if (index > 0) doc.moveTo(x, y + 6).lineTo(x, y + height - 6).lineWidth(0.4).stroke('#c9d6e3');
    doc.font('Helvetica-Bold').fontSize(6.3).fillColor(COLORS.muted)
      .text(label, x + 6, y + 7, { width: cellWidth - 12, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(color)
      .text(String(value), x + 6, y + 19, { width: cellWidth - 12, align: 'center', lineBreak: false });
  });
  return y + height;
}

function signatures(doc, payload, settings) {
  const y = 732;
  const columnWidth = PAGE.contentWidth / 2;
  const school = payload.school || {};
  const headName = school.headTeacherName || settings?.headTeacherName || '';
  const classTeacher = payload.classTeacherName || '';

  [0, 1].forEach((index) => {
    const x = PAGE.margin + index * columnWidth;
    doc.moveTo(x + 4, y).lineTo(x + columnWidth - 20, y).lineWidth(0.6).stroke(COLORS.ink);
  });

  doc.font('Helvetica-Bold').fontSize(7.6).fillColor(COLORS.ink)
    .text(`Class Teacher: ${classTeacher}`, PAGE.margin + 4, y + 5, {
      width: columnWidth - 24,
      lineBreak: false,
      ellipsis: true
    });
  doc.font('Helvetica-Bold').fontSize(7.6).fillColor(COLORS.ink)
    .text(`Head Teacher: ${headName}`, PAGE.margin + columnWidth + 4, y + 5, {
      width: columnWidth - 24,
      lineBreak: false,
      ellipsis: true
    });
}

function footer(doc, payload) {
  // Keep the whole footer ABOVE PDFKit's bottom margin (841.89 - 40 = 801.89);
  // drawing below it makes PDFKit silently start a second page.
  const y = PAGE.height - 58;
  doc.moveTo(PAGE.margin, y).lineTo(PAGE.margin + PAGE.contentWidth, y)
    .lineWidth(0.4).stroke(COLORS.line);
  doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted)
    .text(`LPAREPORTS  |  ${payload.typeLabel || 'Term'}`, PAGE.margin, y + 6, {
      width: PAGE.contentWidth,
      align: 'center',
      lineBreak: false
    });
}

/**
 * Exactly one A4 page for every report type. No addPage(), no page numbers,
 * no comment blocks, no attendance, no grading key, no approval/submission
 * details and no aggregate/points column.
 */
export function buildReportPdf(payload, settings) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: PAGE.margin,
        info: {
          Title: `${payload.student?.fullName || payload.student?.name || 'Student'} - ${payload.typeLabel || 'Term'} ${payload.year}`,
          Author: payload.school?.campusName || payload.school?.name || settings?.schoolName || 'LPAREPORTS',
          Subject: 'LPAREPORTS Student Report Card'
        }
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const y = drawSchoolHeader(doc, payload, settings);
      band(doc, y, `${(payload.typeLabel || 'Term').toUpperCase()} REPORT CARD  —  ${payload.year}`);
      studentPanel(doc, payload, 132);
      if (payload.type === 'ANNUAL') annualTable(doc, payload, 210);
      else subjectTable(doc, payload, 210);
      signatures(doc, payload, settings);
      footer(doc, payload);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export function pdfFileName(payload) {
  const code = payload.student?.code || `LPA-${payload.school?.campusShort || 'M'}-${payload.year}`;
  const term = payload.term || '';
  const type = payload.type || 'TERM';
  return `${code}_${term}_${type}_REPORT.pdf`.replace(/[^a-z0-9_-]+/gi, '_');
}
