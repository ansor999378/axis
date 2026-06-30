// ═══════════════════════════════════════════════════════════════
// PDF GENERATOR — Professional & Student Style
// No emojis, no branding, pure pdfMake shapes
// ═══════════════════════════════════════════════════════════════

const PDF_COLORS = {
  primary:   '#6366f1',
  secondary: '#8b5cf6',
  accent:    '#06b6d4',
  success:   '#10b981',
  warning:   '#f59e0b',
  dark:      '#0f172a',
  mid:       '#374151',
  light:     '#f8fafc',
  border:    '#e2e8f0',
  muted:     '#94a3b8',
  white:     '#ffffff',
};

function parseContent(lines) {
  const blocks = [];
  let sectionCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // H1 — colored full-width bar
    if (line.startsWith('# ')) {
      sectionCount++;
      blocks.push({ text: '', margin: [0, 12, 0, 0] });
      blocks.push({
        canvas: [{ type: 'rect', x: 0, y: 0, w: 495, h: 46, r: 8, color: PDF_COLORS.primary }],
      });
      blocks.push({
        columns: [
          {
            stack: [
              { canvas: [{ type: 'rect', x: 0, y: 0, w: 26, h: 26, r: 6, color: 'rgba(255,255,255,0.2)' }] },
              { text: String(sectionCount).padStart(2, '0'), fontSize: 9, bold: true, color: PDF_COLORS.white, margin: [5, -22, 0, 0] },
            ],
            width: 36, margin: [10, -40, 0, 0],
          },
          { text: line.replace(/^# /, ''), fontSize: 14, bold: true, color: PDF_COLORS.white, margin: [4, -40, 0, 0] },
        ],
        margin: [0, 0, 0, 16],
      });
      continue;
    }

    // H2 — left accent line
    if (line.startsWith('## ')) {
      blocks.push({
        columns: [
          { canvas: [{ type: 'rect', x: 0, y: 0, w: 4, h: 22, r: 2, color: PDF_COLORS.accent }], width: 12 },
          { text: line.replace(/^## /, ''), fontSize: 13, bold: true, color: PDF_COLORS.dark, margin: [6, 2, 0, 0] },
        ],
        margin: [0, 10, 0, 6],
      });
      continue;
    }

    // H3
    if (line.startsWith('### ')) {
      blocks.push({
        text: line.replace(/^### /, ''),
        fontSize: 11, bold: true, color: PDF_COLORS.secondary,
        margin: [0, 8, 0, 4],
      });
      continue;
    }

    // Numbered list
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    if (numMatch) {
      blocks.push({
        columns: [
          {
            stack: [
              { canvas: [{ type: 'ellipse', x: 10, y: 10, r1: 10, r2: 10, color: PDF_COLORS.primary }] },
              { text: numMatch[1], fontSize: 9, bold: true, color: PDF_COLORS.white, margin: [numMatch[1].length === 1 ? 7 : 4, -19, 0, 0] },
            ],
            width: 26,
          },
          { text: numMatch[2], fontSize: 11, color: PDF_COLORS.mid, lineHeight: 1.6, margin: [4, 2, 0, 0] },
        ],
        margin: [0, 4, 0, 4],
      });
      continue;
    }

    // Bullet list
    if (line.startsWith('- ') || line.startsWith('* ')) {
      blocks.push({
        columns: [
          { text: '-', fontSize: 14, color: PDF_COLORS.accent, bold: true, width: 14 },
{ text: line.replace(/^[-*] /, ''), fontSize: 11, color: PDF_COLORS.mid, lineHeight: 1.6 },
        ],
        margin: [8, 2, 0, 2],
      });
      continue;
    }

    // Bold standalone line
    if (line.startsWith('**') && line.endsWith('**')) {
      blocks.push({
        text: line.replace(/\*\*/g, ''),
        fontSize: 11, bold: true, color: PDF_COLORS.dark,
        margin: [0, 4, 0, 4],
      });
      continue;
    }

    // Divider
    if (line === '---' || line === '___') {
      blocks.push({
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 1, lineColor: PDF_COLORS.border }],
        margin: [0, 10, 0, 10],
      });
      continue;
    }

    // Regular paragraph with inline bold
    if (line.trim()) {
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      if (parts.length > 1) {
        blocks.push({
          text: parts.map(p =>
            p.startsWith('**') && p.endsWith('**')
              ? { text: p.replace(/\*\*/g, ''), bold: true, color: PDF_COLORS.dark }
              : { text: p, color: PDF_COLORS.mid }
          ),
          fontSize: 11, lineHeight: 1.7, margin: [0, 2, 0, 4],
        });
      } else {
        blocks.push({ text: line, fontSize: 11, color: PDF_COLORS.mid, lineHeight: 1.7, margin: [0, 2, 0, 4] });
      }
    }
  }
  return blocks;
}


function generatePDF(btn) {
  const msgBlock = btn.closest('.msg-content');
  const bubble   = msgBlock.querySelector('.msg-bubble');
  const rawText  = bubble.innerText;
  const lines    = rawText.split('\n').filter(l => l.trim());
  const content  = parseContent(lines);

  const now     = new Date();
  const dateStr = now.toLocaleDateString('uz-UZ');
  const timeStr = now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });

  const docDef = {
    pageSize: 'A4',
    pageMargins: [50, 95, 50, 65],

    header: () => ({
      columns: [
        {
          stack: [
            { canvas: [{ type: 'rect', x: 0, y: 0, w: 32, h: 5, r: 2, color: PDF_COLORS.primary }] },
            { canvas: [{ type: 'rect', x: 0, y: 0, w: 20, h: 4, r: 2, color: PDF_COLORS.accent }], margin: [0, 3, 0, 0] },
          ],
          margin: [50, 24, 0, 0], width: 60,
        },
        {
          stack: [
            { text: 'Smart Report', fontSize: 9, bold: true, color: PDF_COLORS.mid, alignment: 'right' },
            { text: dateStr + '  ' + timeStr, fontSize: 7, color: PDF_COLORS.muted, alignment: 'right', margin: [0, 2, 0, 0] },
          ],
          margin: [0, 22, 50, 0],
        },
      ],
    }),

    footer: (page, pages) => ({
      stack: [
        { canvas: [{ type: 'line', x1: 50, y1: 0, x2: 545, y2: 0, lineWidth: 0.5, lineColor: PDF_COLORS.border }], margin: [0, 0, 0, 6] },
        {
          columns: [
            { text: 'Smart Report  |  ' + dateStr, fontSize: 8, color: PDF_COLORS.muted, margin: [50, 0, 0, 0] },
            { text: page + '  /  ' + pages, fontSize: 8, bold: true, color: PDF_COLORS.primary, alignment: 'right', margin: [0, 0, 50, 0] },
          ],
        },
      ],
    }),

    content: [
      // COVER
      {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: 495, h: 115, r: 12, color: PDF_COLORS.dark },
          { type: 'rect', x: 330, y: 0, w: 165, h: 115, r: 12, color: PDF_COLORS.primary },
          { type: 'ellipse', x: 400, y: 35, r1: 38, r2: 38, color: PDF_COLORS.secondary },
          { type: 'ellipse', x: 455, y: 85, r1: 22, r2: 22, color: PDF_COLORS.accent },
          { type: 'ellipse', x: 375, y: 95, r1: 6, r2: 6, color: PDF_COLORS.white },
          { type: 'ellipse', x: 480, y: 18, r1: 5, r2: 5, color: PDF_COLORS.white },
        ],
      },
      {
        stack: [
          { canvas: [{ type: 'rect', x: 0, y: 0, w: 40, h: 4, r: 2, color: PDF_COLORS.accent }], margin: [0, 0, 0, 8] },
          { text: 'Professional Report', fontSize: 22, bold: true, color: PDF_COLORS.white },
          { text: dateStr + '   ' + timeStr, fontSize: 9, color: '#94a3b8', margin: [0, 6, 0, 0] },
        ],
        absolutePosition: { x: 66, y: 96 },
      },

      { text: '', margin: [0, 90, 0, 0] },

      // INFO CARDS
      {
        columns: [
          {
            stack: [
              { canvas: [{ type: 'rect', x: 0, y: 0, w: 148, h: 56, r: 8, color: '#eef2ff' }] },
              { canvas: [{ type: 'rect', x: 0, y: 0, w: 18, h: 18, r: 4, color: PDF_COLORS.primary }], margin: [10, -46, 0, 0], width: 20 },
              { text: 'DOCUMENT', fontSize: 7, bold: true, color: PDF_COLORS.primary, margin: [10, 4, 0, 0] },
              { text: 'Smart Report', fontSize: 9, color: PDF_COLORS.mid, margin: [10, 2, 0, 0] },
            ],
            width: 148,
          },
          { text: '', width: 10 },
          {
            stack: [
              { canvas: [{ type: 'rect', x: 0, y: 0, w: 148, h: 56, r: 8, color: '#ecfdf5' }] },
              { canvas: [{ type: 'ellipse', x: 9, y: 9, r1: 9, r2: 9, color: PDF_COLORS.success }], margin: [10, -46, 0, 0], width: 20 },
              { text: 'CREATED BY', fontSize: 7, bold: true, color: PDF_COLORS.success, margin: [10, 4, 0, 0] },
              { text: 'AI Assistant', fontSize: 9, color: PDF_COLORS.mid, margin: [10, 2, 0, 0] },
            ],
            width: 148,
          },
          { text: '', width: 10 },
          {
            stack: [
              { canvas: [{ type: 'rect', x: 0, y: 0, w: 148, h: 56, r: 8, color: '#fffbeb' }] },
              { canvas: [{ type: 'ellipse', x: 9, y: 9, r1: 9, r2: 9, color: PDF_COLORS.warning }], margin: [10, -46, 0, 0], width: 20 },
              { text: 'DATE', fontSize: 7, bold: true, color: PDF_COLORS.warning, margin: [10, 4, 0, 0] },
              { text: dateStr, fontSize: 9, color: PDF_COLORS.mid, margin: [10, 2, 0, 0] },
            ],
            width: 148,
          },
        ],
        margin: [0, 16, 0, 0],
      },

      // DIVIDER
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 2, lineColor: PDF_COLORS.primary }],
        margin: [0, 20, 0, 24],
      },

      // CONTENT
      ...content,

      // CLOSING
      { text: '', margin: [0, 28, 0, 0] },
      {
        canvas: [
          { type: 'rect', x: 0, y: 0, w: 495, h: 44, r: 10, color: PDF_COLORS.dark },
          { type: 'rect', x: 0, y: 0, w: 100, h: 44, r: 10, color: PDF_COLORS.primary },
          { type: 'ellipse', x: 50, y: 22, r1: 14, r2: 14, color: 'rgba(255,255,255,0.15)' },
        ],
      },
      {
        text: 'Professional Smart Report  |  ' + dateStr,
        fontSize: 9, color: PDF_COLORS.muted, alignment: 'right',
        margin: [0, -28, 16, 0],
      },
    ],

    styles: {
      h1:     { fontSize: 14, bold: true, color: PDF_COLORS.white },
      h2:     { fontSize: 13, bold: true, color: PDF_COLORS.dark },
      h3:     { fontSize: 11, bold: true, color: PDF_COLORS.secondary },
      body:   { fontSize: 11, color: PDF_COLORS.mid, lineHeight: 1.7 },
      bullet: { fontSize: 11, color: PDF_COLORS.mid, lineHeight: 1.6 },
      bold:   { fontSize: 11, bold: true, color: PDF_COLORS.dark },
    },

    defaultStyle: { font: 'Roboto', fontSize: 11, color: PDF_COLORS.mid },
  };

  pdfMake.createPdf(docDef).download('Smart-Report-' + dateStr + '.pdf');
}


function exportToPDF() {
  if (!AppState.conversation.length) { alert('No conversation to export yet.'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let y = 20;
  doc.setFontSize(18);
  doc.text('Conversation Export', 14, y);
  y += 12;
  doc.setFontSize(11);
  AppState.conversation.forEach(msg => {
    const label = msg.role === 'user' ? 'You' : 'Assistant';
    const text  = '[' + (msg.time || '') + '] ' + label + ': ' + msg.content;
    const lines = doc.splitTextToSize(text, 180);
    if (y + lines.length * 7 > 280) { doc.addPage(); y = 20; }
    doc.text(lines, 14, y);
    y += lines.length * 7 + 4;
  });
  doc.save('conversation-' + new Date().toLocaleDateString('uz-UZ') + '.pdf');
}

function exportForDocs() {
  if (!AppState.conversation.length) { alert('No conversation to export yet.'); return; }
  const text = AppState.conversation
    .map(m => (m.role === 'user' ? 'You' : 'Assistant') + ' [' + (m.time || '') + ']:\n' + m.content)
    .join('\n\n─────────────────\n\n');
  navigator.clipboard.writeText(text)
    .then(() => alert('Copied! Paste into Google Docs.'))
    .catch(() => alert('Could not copy.'));
}