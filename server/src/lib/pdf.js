import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import { scalesFor, termLabel } from '../lib/grading.js';

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
  amber: '#8a6100'
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 40,
  contentWidth: 515.28
};

const LEVEL_TITLES = {
  NURSERY: 'NURSERY SECTION',
  LOWER_PRIMARY: 'LOWER PRIMARY SECTION',
  UPPER_PRIMARY: 'UPPER PRIMARY SECTION'
};

function headerBand(doc, y, text, subtext) {
  doc.rect(PAGE.margin, y, PAGE.contentWidth, 26).fill(COLORS.navy);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(11.5)
    .text(text, PAGE.margin + 10, y + 7, { width: PAGE.contentWidth - 20, align: 'center' });
  if (subtext) {
    doc.font('Helvetica').fontSize(7.5).fillColor('#dbe6f2')
      .text(subtext, PAGE.margin + PAGE.contentWidth - 190, y + 9, { width: 180, align: 'right' });
  }
  return y + 26;
}

function drawSchoolHeader(doc, payload) {
  const { school } = payload;
  let textX = PAGE.margin;
  let textWidth = PAGE.contentWidth;

  if (fs.existsSync(LOGO_PATH)) {
    try {
      doc.image(LOGO_PATH, PAGE.margin, PAGE.margin, { fit: [58, 58] });
      textX = PAGE.margin + 70;
      textWidth = PAGE.contentWidth - 140;
    } catch (error) {
      // Ignore a corrupt logo and fall back to text-only header.
    }
  }

  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(19)
    .text(school.name.toUpperCase(), textX, PAGE.margin + 2, { width: textWidth, align: 'center' });
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(COLORS.green)
    .text(school.motto, textX, PAGE.margin + 27, { width: textWidth, align: 'center' });
  doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted)
    .text(`${school.address}  |  Tel: ${school.phone}  |  ${school.email}`, textX, PAGE.margin + 40, {
      width: textWidth,
      align: 'center'
    });
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.muted)
    .text('OFFICE OF THE HEAD TEACHER', textX, PAGE.margin + 52, { width: textWidth, align: 'center' });

  doc.moveTo(PAGE.margin, 108).lineTo(PAGE.margin + PAGE.contentWidth, 108).lineWidth(1.4).stroke(COLORS.navy);
  doc.moveTo(PAGE.margin, 111).lineTo(PAGE.margin + PAGE.contentWidth, 111).lineWidth(0.5).stroke(COLORS.green);
  return 120;
}

function infoPanel(doc, payload, y) {
  const rows = [
    ['STUDENT NAME', payload.student.fullName, 'STUDENT ID', payload.student.code],
    ['CLASS', `${payload.className} (${LEVEL_TITLES[payload.level]})`, 'GENDER', payload.student.gender === 'FEMALE' ? 'Female' : 'Male'],
    [
      'ATTENDANCE',
      payload.attendance.percent !== null
        ? `${payload.attendance.present}/${payload.attendance.total} days (${payload.attendance.percent}%)`
        : 'Not recorded',
      'POSITION IN CLASS',
      payload.summary.position ? `${payload.summary.positionLabel} of ${payload.summary.outOf}` : 'Not ranked'
    ]
  ];

  doc.rect(PAGE.margin, y, PAGE.contentWidth, 70).fill(COLORS.light);
  doc.rect(PAGE.margin, y, 3, 70).fill(COLORS.green);

  const colWidth = PAGE.contentWidth / 2;
  rows.forEach((row, index) => {
    const rowY = y + 9 + index * 19;
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLORS.muted)
      .text(row[0], PAGE.margin + 12, rowY, { width: 80, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.7).fillColor(COLORS.ink)
      .text(String(row[1] || '-'), PAGE.margin + 88, rowY - 1, { width: colWidth - 98, lineBreak: false, ellipsis: true });

    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLORS.muted)
      .text(row[2], PAGE.margin + colWidth + 8, rowY, { width: 90, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(8.7).fillColor(COLORS.ink)
      .text(String(row[3] || '-'), PAGE.margin + colWidth + 92, rowY - 1, {
        width: colWidth - 102,
        lineBreak: false,
        ellipsis: true
      });
  });

  return y + 82;
}

function drawTable(doc, payload, settings, startY) {
  const columns = [
    { key: 'index', label: '#', width: 22, align: 'center' },
    { key: 'subject', label: 'SUBJECT', width: 146, align: 'left' },
    { key: 'ca', label: 'C/W', width: 38, align: 'center' },
    { key: 'exam', label: 'EXAM', width: 40, align: 'center' },
    { key: 'total', label: 'TOTAL', width: 43, align: 'center' },
    { key: 'grade', label: 'GRADE', width: 40, align: 'center' },
    {
      key: 'remark',
      label: payload.level === 'UPPER_PRIMARY' ? 'REMARKS' : 'COMPETENCY / REMARKS',
      width: 116,
      align: 'left'
    },
    { key: 'teacher', label: 'TEACHER', width: 70, align: 'left' }
  ];

  const xs = [];
  let cursor = PAGE.margin;
  columns.forEach((col) => {
    xs.push(cursor);
    cursor += col.width;
  });

  const headerHeight = 20;
  doc.rect(PAGE.margin, startY, PAGE.contentWidth, headerHeight).fill(COLORS.navy);
  columns.forEach((col, i) => {
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor(COLORS.white)
      .text(col.label, xs[i] + 4, startY + 6.5, {
        width: col.width - 8,
        align: col.align,
        lineBreak: false
      });
  });

  let y = startY + headerHeight;
  const rowPadding = 4.5;

  payload.marks.forEach((mark, index) => {
    const remark = payload.level === 'UPPER_PRIMARY' ? mark.remark : mark.competency || mark.remark;
    const subjectText = mark.subject;
    doc.font('Helvetica-Bold').fontSize(7.8);
    const subjectHeight = doc.heightOfString(subjectText, { width: columns[1].width - 8 });
    doc.font('Helvetica').fontSize(7);
    const remarkHeight = doc.heightOfString(String(remark || '-'), { width: columns[6].width - 8 });
    const rowHeight = Math.max(18, Math.ceil(Math.max(subjectHeight, remarkHeight) + rowPadding * 2));

    if (y + rowHeight > 760) {
      doc.addPage();
      y = PAGE.margin;
    }

    if (index % 2 === 1) {
      doc.rect(PAGE.margin, y, PAGE.contentWidth, rowHeight).fill(COLORS.light);
    }
    doc.rect(PAGE.margin, y, PAGE.contentWidth, rowHeight).lineWidth(0.35).stroke(COLORS.line);

    const textY = y + rowPadding;
    doc.font('Helvetica').fontSize(7.2).fillColor(COLORS.muted)
      .text(String(index + 1), xs[0] + 4, textY + 1, { width: columns[0].width - 8, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(7.8).fillColor(COLORS.ink)
      .text(subjectText, xs[1] + 4, textY, { width: columns[1].width - 8 });
    doc.font('Helvetica').fontSize(7.6).fillColor(COLORS.ink)
      .text(mark.caScore === null ? '-' : String(mark.caScore), xs[2] + 4, textY, { width: columns[2].width - 8, align: 'center', lineBreak: false })
      .text(mark.examScore === null ? '-' : String(mark.examScore), xs[3] + 4, textY, { width: columns[3].width - 8, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(COLORS.navy)
      .text(mark.total === null ? '-' : String(mark.total), xs[4] + 4, textY, { width: columns[4].width - 8, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(mark.grade && ['F9', 'U', 'E'].includes(mark.grade) ? COLORS.amber : COLORS.green)
      .text(mark.grade || '-', xs[5] + 4, textY, { width: columns[5].width - 8, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(7).fillColor(COLORS.ink)
      .text(String(remark || '-'), xs[6] + 4, textY, { width: columns[6].width - 8 });
    doc.font('Helvetica').fontSize(6.5).fillColor(COLORS.muted)
      .text(mark.teacher || '-', xs[7] + 4, textY, { width: columns[7].width - 8, lineBreak: false, ellipsis: true });

    y += rowHeight;
  });

  if (!payload.marks.length) {
    doc.rect(PAGE.margin, y, PAGE.contentWidth, 28).stroke(COLORS.line);
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(COLORS.muted)
      .text('No assessment scores recorded for this term.', PAGE.margin, y + 10, { width: PAGE.contentWidth, align: 'center' });
    y += 28;
  }

  return y;
}

function summaryStrip(doc, payload, y) {
  const cells = [
    ['SUBJECTS ASSESSED', payload.summary.subjectsAssessed],
    ['TOTAL MARKS', payload.summary.totalMarks],
    ['AVERAGE', `${payload.summary.average ?? '-'}%`],
    ['OVERALL GRADE', payload.summary.grade],
    ['POSITION', payload.summary.position ? `${payload.summary.positionLabel} / ${payload.summary.outOf}` : '-']
  ];
  const height = 42;
  const width = PAGE.contentWidth / cells.length;
  doc.rect(PAGE.margin, y, PAGE.contentWidth, height).fill('#eef3f8');
  doc.rect(PAGE.margin, y, PAGE.contentWidth, 0.8).fill(COLORS.navy);

  cells.forEach((cell, index) => {
    const x = PAGE.margin + index * width;
    if (index > 0) doc.moveTo(x, y + 7).lineTo(x, y + height - 7).lineWidth(0.4).stroke('#c9d6e3');
    doc.font('Helvetica-Bold').fontSize(6.2).fillColor(COLORS.muted)
      .text(cell[0], x + 5, y + 8, { width: width - 10, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.navy)
      .text(String(cell[1] ?? '-'), x + 5, y + 19, { width: width - 10, align: 'center' });
  });

  return y + height + 8;
}

function gradingKey(doc, payload, settings, y) {
  const scale = scalesFor(settings, payload.level);
  const parts = scale.map((item) => `${item.grade} ${item.min}-${item.max} (${item.remark})`);
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLORS.muted)
    .text('GRADING KEY:', PAGE.margin, y, { continued: true, lineBreak: false })
    .font('Helvetica').fontSize(6.5).fillColor(COLORS.ink)
    .text(` ${parts.join('   |   ')}`, { width: PAGE.contentWidth });
  return y + Math.max(12, doc.heightOfString(parts.join(' | '), { width: PAGE.contentWidth, fontSize: 6.5 }) + 6);
}

function commentsBlock(doc, payload, settings, y) {
  const sections = [
    { label: "CLASS TEACHER'S COMMENT", text: payload.comments.teacher || '................................................................................................................' },
    { label: "DEAN OF STUDIES' COMMENT", text: payload.comments.dos || '................................................................................................................' },
    { label: "HEAD TEACHER'S COMMENT", text: payload.comments.headTeacher || '................................................................................................................' }
  ];

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.navy)
    .text('COMMENTS', PAGE.margin, y);
  y += 12;

  sections.forEach((section) => {
    if (y > 748) {
      doc.addPage();
      y = PAGE.margin;
    }
    doc.font('Helvetica-Bold').fontSize(6.5).fillColor(COLORS.muted)
      .text(section.label, PAGE.margin, y);
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.ink)
      .text(section.text, PAGE.margin, y + 10, { width: PAGE.contentWidth, lineGap: 1.5 });
    const used = doc.heightOfString(section.text, { width: PAGE.contentWidth, fontSize: 8, lineGap: 1.5 });
    y += 14 + Math.max(18, used);
    doc.moveTo(PAGE.margin + 330, y - 2).lineTo(PAGE.margin + PAGE.contentWidth, y - 2)
      .lineWidth(0.5).stroke(COLORS.line);
    doc.font('Helvetica-Oblique').fontSize(6).fillColor(COLORS.muted)
      .text('Signature / Date', PAGE.margin + 400, y + 1, { width: 120, align: 'right' });
    y += 14;
  });

  if (y > 735) {
    doc.addPage();
    y = PAGE.margin;
  }

  const signY = y + 10;
  const slots = [
    { label: 'Class Teacher', name: payload.marks.find((m) => m.teacher)?.teacher || '' },
    { label: 'Dean of Studies', name: settings.dosName },
    { label: 'Head Teacher', name: settings.headTeacherName }
  ];
  const slotWidth = PAGE.contentWidth / 3;
  slots.forEach((slot, index) => {
    const x = PAGE.margin + index * slotWidth;
    doc.moveTo(x + 8, signY).lineTo(x + slotWidth - 18, signY).lineWidth(0.6).stroke(COLORS.ink);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.ink)
      .text(slot.name || '................................', x + 8, signY + 4, { width: slotWidth - 26 });
    doc.font('Helvetica').fontSize(6).fillColor(COLORS.muted)
      .text(slot.label.toUpperCase(), x + 8, signY + 15, { width: slotWidth - 26 });
  });

  return signY + 30;
}

function compactHeader(doc, payload, title) {
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(12)
    .text(payload.school.name.toUpperCase(), PAGE.margin, PAGE.margin, { width: PAGE.contentWidth, align: 'center' });
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
    .text(`${payload.student.fullName}  |  ${payload.student.code}  |  ${payload.className}`, PAGE.margin, PAGE.margin + 16, {
      width: PAGE.contentWidth,
      align: 'center'
    });
  doc.moveTo(PAGE.margin, PAGE.margin + 30).lineTo(PAGE.margin + PAGE.contentWidth, PAGE.margin + 30)
    .lineWidth(1).stroke(COLORS.navy);
  headerBand(doc, PAGE.margin + 38, title, null);
  return PAGE.margin + 74;
}

function cumulativePage(doc, payload, settings) {
  if (payload.term !== 'TERM3' || !payload.cumulative) return;

  doc.addPage();
  let y = compactHeader(doc, payload, `ANNUAL CUMULATIVE SUMMARY — ${payload.year}`);

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.navy)
    .text('TERM-BY-TERM PERFORMANCE', PAGE.margin, y);
  y += 13;

  const termColumns = ['TERM', 'AVERAGE', 'GRADE', 'REMARK'];
  const termWidths = [150, 100, 80, 185];
  doc.rect(PAGE.margin, y, PAGE.contentWidth, 18).fill(COLORS.navy);
  let x = PAGE.margin;
  termColumns.forEach((label, index) => {
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.white)
      .text(label, x + 5, y + 5.5, { width: termWidths[index] - 10, align: index === 0 ? 'left' : 'center' });
    x += termWidths[index];
  });
  y += 18;

  payload.cumulative.termAverages.forEach((term, rowIndex) => {
    if (rowIndex % 2 === 1) doc.rect(PAGE.margin, y, PAGE.contentWidth, 18).fill(COLORS.light);
    doc.rect(PAGE.margin, y, PAGE.contentWidth, 18).lineWidth(0.35).stroke(COLORS.line);
    const values = [
      term.label,
      term.average === null ? '-' : `${term.average}%`,
      term.grade,
      term.grade === '-' ? 'Not assessed' : ''
    ];
    let cellX = PAGE.margin;
    values.forEach((value, index) => {
      doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.6).fillColor(COLORS.ink)
        .text(String(value), cellX + 5, y + 5.5, { width: termWidths[index] - 10, align: index === 0 ? 'left' : 'center' });
      cellX += termWidths[index];
    });
    y += 18;
  });

  y += 14;
  doc.rect(PAGE.margin, y, PAGE.contentWidth, 34).fill('#eef3f8');
  doc.rect(PAGE.margin, y, 3, 34).fill(COLORS.navy);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.muted)
    .text('OVERALL ANNUAL AVERAGE', PAGE.margin + 12, y + 7);
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.navy)
    .text(`${payload.cumulative.overallAverage ?? '-'}%`, PAGE.margin + 12, y + 15);
  doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.muted)
    .text('FINAL GRADE', PAGE.margin + 210, y + 7);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.green)
    .text(payload.cumulative.overallGrade, PAGE.margin + 210, y + 16);
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.ink)
    .text(payload.cumulative.overallRemark, PAGE.margin + 300, y + 15, { width: 200 });

  y += 48;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.navy)
    .text('SUBJECT CUMULATIVE PERFORMANCE', PAGE.margin, y);
  y += 13;

  const cols = [
    { label: 'SUBJECT', width: 165 },
    { label: 'TERM I', width: 55 },
    { label: 'TERM II', width: 55 },
    { label: 'TERM III', width: 58 },
    { label: 'AVERAGE', width: 60 },
    { label: 'GRADE', width: 48 },
    { label: 'REMARK', width: 74.28 }
  ];
  doc.rect(PAGE.margin, y, PAGE.contentWidth, 18).fill(COLORS.navy);
  x = PAGE.margin;
  cols.forEach((col, index) => {
    doc.font('Helvetica-Bold').fontSize(6.7).fillColor(COLORS.white)
      .text(col.label, x + 4, y + 5.5, { width: col.width - 8, align: index === 0 ? 'left' : 'center' });
    x += col.width;
  });
  y += 18;

  payload.cumulative.subjects.forEach((subject, rowIndex) => {
    const remarkHeight = doc.font('Helvetica').fontSize(6.8)
      .heightOfString(subject.remark || '-', { width: cols[6].width - 8 });
    const rowHeight = Math.max(17, remarkHeight + 8);
    if (y + rowHeight > 770) {
      doc.addPage();
      y = PAGE.margin;
    }
    if (rowIndex % 2 === 1) doc.rect(PAGE.margin, y, PAGE.contentWidth, rowHeight).fill(COLORS.light);
    doc.rect(PAGE.margin, y, PAGE.contentWidth, rowHeight).lineWidth(0.35).stroke(COLORS.line);

    const values = [
      subject.subject,
      subject.t1 ?? '-',
      subject.t2 ?? '-',
      subject.t3 ?? '-',
      subject.average ?? '-',
      subject.grade,
      subject.remark || '-'
    ];
    let cellX = PAGE.margin;
    values.forEach((value, index) => {
      doc.font(index === 0 || index === 4 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(index === 0 ? 7.2 : 7)
        .fillColor(index === 0 ? COLORS.ink : COLORS.ink)
        .text(String(value), cellX + 4, y + 4.5, {
          width: cols[index].width - 8,
          align: index === 0 || index === 6 ? 'left' : 'center'
        });
      cellX += cols[index].width;
    });
    y += rowHeight;
  });

  y += 10;
  doc.font('Helvetica-Oblique').fontSize(7).fillColor(COLORS.muted)
    .text(
      'The cumulative summary combines the Term I, Term II and Term III results for the academic year. Averages are calculated from recorded subject totals.',
      PAGE.margin,
      y,
      { width: PAGE.contentWidth }
    );

  // Keep the signature block together on one page. If the cumulative table has
  // reached the bottom of the sheet, start a fresh page for the signatories.
  if (y > 700) {
    doc.addPage();
    y = PAGE.margin;
  }
  const signY = Math.max(760, y + 20);
  const slots = [
    { label: 'Class Teacher', name: payload.marks.find((m) => m.teacher)?.teacher || '' },
    { label: 'Dean of Studies', name: settings.dosName },
    { label: 'Head Teacher', name: settings.headTeacherName }
  ];
  const slotWidth = PAGE.contentWidth / 3;
  slots.forEach((slot, index) => {
    const sx = PAGE.margin + index * slotWidth;
    doc.moveTo(sx + 8, signY).lineTo(sx + slotWidth - 18, signY).lineWidth(0.6).stroke(COLORS.ink);
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.ink)
      .text(slot.name || '................................', sx + 8, signY + 4, { width: slotWidth - 26 });
    doc.font('Helvetica').fontSize(6).fillColor(COLORS.muted)
      .text(slot.label.toUpperCase(), sx + 8, signY + 15, { width: slotWidth - 26 });
  });
}

function footers(doc, payload) {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const footerY = PAGE.height - 34;
    doc.moveTo(PAGE.margin, footerY).lineTo(PAGE.margin + PAGE.contentWidth, footerY)
      .lineWidth(0.4).stroke(COLORS.line);
    doc.font('Helvetica').fontSize(6).fillColor(COLORS.muted)
      .text(
        `LPACAMIS  |  ${payload.student.code}  |  ${payload.termLabel} ${payload.year}  |  Generated ${new Date().toLocaleString('en-GB')}`,
        PAGE.margin,
        footerY + 5,
        { width: PAGE.contentWidth - 90 }
      );
    doc.font('Helvetica').fontSize(6).fillColor(COLORS.muted)
      .text(`Page ${index + 1} of ${range.count}`, PAGE.margin + PAGE.contentWidth - 85, footerY + 5, {
        width: 85,
        align: 'right'
      });
  }
}

export function buildReportPdf(payload, settings) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: PAGE.margin,
        bufferPages: true,
        info: {
          Title: `${payload.student.fullName} - ${payload.termLabel} ${payload.year} Report Card`,
          Author: settings.schoolName,
          Subject: 'Student Report Card'
        }
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let y = drawSchoolHeader(doc, payload);
      y = headerBand(
        doc,
        y,
        `${payload.termLabel.toUpperCase()} REPORT CARD  —  ${payload.year}`,
        `STUDENT ID: ${payload.student.code}`
      );
      y += 12;
      y = infoPanel(doc, payload, y);
      y = drawTable(doc, payload, settings, y);
      y += 10;
      y = summaryStrip(doc, payload, y);
      y = gradingKey(doc, payload, settings, y);
      y += 4;
      y = commentsBlock(doc, payload, settings, y);

      cumulativePage(doc, payload, settings);
      footers(doc, payload);

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export function pdfFileName(payload) {
  const safeName = payload.student.fullName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return `${payload.student.code}-${safeName}-${payload.term}-${payload.year}.pdf`;
}
