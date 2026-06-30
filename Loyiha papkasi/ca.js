// ═══════════════════════════════════════════════════════════════
// CANVAS BLOCK EDITOR — Notion-style
// ═══════════════════════════════════════════════════════════════

// ── State ──
let canvasBlocks = [];
let dragSrcIdx   = null;
let slashMenuIdx = null;

const BLOCK_TYPES = [
  { type: 'text',     label: 'Text',      icon: 'T',   shortcut: '/text' },
  { type: 'h1',       label: 'Heading 1', icon: 'H1',  shortcut: '/h1' },
  { type: 'h2',       label: 'Heading 2', icon: 'H2',  shortcut: '/h2' },
  { type: 'h3',       label: 'Heading 3', icon: 'H3',  shortcut: '/h3' },
  { type: 'bullet',   label: 'Bullet',    icon: '•',   shortcut: '/bullet' },
  { type: 'numbered', label: 'Numbered',  icon: '1.',  shortcut: '/num' },
  { type: 'todo',     label: 'To-do',     icon: '☐',   shortcut: '/todo' },
  { type: 'table',    label: 'Table',     icon: '⊞',   shortcut: '/table' },
  { type: 'quote',    label: 'Quote',     icon: '"',   shortcut: '/quote' },
  { type: 'code',     label: 'Code',      icon: '</>',  shortcut: '/code' },
  { type: 'divider',  label: 'Divider',   icon: '—',   shortcut: '/div' },
];

function genId() {
  return '_' + Math.random().toString(36).slice(2, 9);
}

function phosphorIcon(type) {
  const map = {
    text:     'ph-text-t',
    h1:       'ph-text-h-one',
    h2:       'ph-text-h-two',
    h3:       'ph-text-h-three',
    bullet:   'ph-list-dashes',
    numbered: 'ph-list-numbers',
    todo:     'ph-check-circle',
    table:    'ph-table',
    quote:    'ph-quotes',
    code:     'ph-code-simple',
    divider:  'ph-minus',
  };
  return map[type] || 'ph-text-t';
}

function makeBlock(type, content) {
  const b = { id: genId(), type, content: content ?? '' };
  if (type === 'todo')  b.checked = false;
  if (type === 'table') b.rows = [
    ['', '', ''],
    ['', '', ''],
    ['', '', ''],
  ];
  return b;
}

// ═══════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════

function renderCanvas() {
  const editor = document.getElementById('canvasEditor');
  if (!editor) return;

  const focusedId = document.activeElement?.closest?.('[data-block-id]')?.dataset?.blockId;
  const selBefore = window.getSelection();
  const savedRange = (focusedId && selBefore?.rangeCount) ? selBefore.getRangeAt(0).cloneRange() : null;

  editor.innerHTML = '';

  if (canvasBlocks.length === 0) {
    canvasBlocks.push(makeBlock('text', ''));
  }

  let numCount = 0;

  canvasBlocks.forEach((block, idx) => {
    if (block.type === 'numbered') numCount++;
    else numCount = 0;

    const wrapper = document.createElement('div');
    wrapper.className = 'cb-block';
    wrapper.dataset.blockId = block.id;
    wrapper.dataset.idx = idx;
    wrapper.draggable = true;

    // Click on empty block area → focus editable
    wrapper.addEventListener('click', e => {
      if (e.target === wrapper) {
        const ed = wrapper.querySelector('[contenteditable]');
        if (ed) { ed.focus(); placeCaretAtEnd(ed); }
      }
    });

    // Drag handle
    const handle = document.createElement('div');
    handle.className = 'cb-handle';
    handle.innerHTML = '⠿';
    handle.title = 'Drag to reorder';
    handle.addEventListener('mousedown', e => e.preventDefault());
    wrapper.appendChild(handle);

    // Block content area
    const content = buildBlockContent(block, idx, numCount);
    wrapper.appendChild(content);

    // Drag events
    wrapper.addEventListener('dragstart', e => {
      dragSrcIdx = idx;
      wrapper.classList.add('cb-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    wrapper.addEventListener('dragend', () => {
      wrapper.classList.remove('cb-dragging');
      document.querySelectorAll('.cb-block').forEach(b => b.classList.remove('cb-drag-over'));
    });
    wrapper.addEventListener('dragover', e => {
      e.preventDefault();
      document.querySelectorAll('.cb-block').forEach(b => b.classList.remove('cb-drag-over'));
      wrapper.classList.add('cb-drag-over');
    });
    wrapper.addEventListener('drop', e => {
      e.preventDefault();
      wrapper.classList.remove('cb-drag-over');
      if (dragSrcIdx === null || dragSrcIdx === idx) return;
      const moved = canvasBlocks.splice(dragSrcIdx, 1)[0];
      const newIdx = dragSrcIdx < idx ? idx - 1 : idx;
      canvasBlocks.splice(newIdx, 0, moved);
      dragSrcIdx = null;
      renderCanvas();
    });

    editor.appendChild(wrapper);
  });

  // Restore focus and selection
  if (focusedId) {
    const target = editor.querySelector(`[data-block-id="${focusedId}"] [contenteditable]`);
    if (target) {
      target.focus();
      if (savedRange) {
        try {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(savedRange);
        } catch { placeCaretAtEnd(target); }
      } else {
        placeCaretAtEnd(target);
      }
    }
  }

  updateToolbarActive();
}

function buildBlockContent(block, idx, numCount) {
  const wrap = document.createElement('div');
  wrap.className = 'cb-content-wrap';

  if (block.type === 'divider') {
    const hr = document.createElement('div');
    hr.className = 'cb-divider';
    wrap.appendChild(hr);
    const del = document.createElement('button');
    del.className = 'cb-del-btn';
    del.innerHTML = '×';
    del.title = 'Delete block';
    del.onclick = () => deleteBlock(idx);
    wrap.appendChild(del);
    return wrap;
  }

  if (block.type === 'table') {
    wrap.appendChild(buildTable(block, idx));
    return wrap;
  }

  if (block.type === 'todo') {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'cb-todo-check';
    cb.checked = !!block.checked;
    cb.addEventListener('change', () => {
      block.checked = cb.checked;
      const el = cb.closest('.cb-content-wrap').querySelector('.cb-editable');
      if (el) el.classList.toggle('cb-todo-done', block.checked);
    });
    wrap.appendChild(cb);
  }

  if (block.type === 'bullet') {
    const dot = document.createElement('span');
    dot.className = 'cb-bullet-dot';
    dot.textContent = '•';
    wrap.appendChild(dot);
  }

  if (block.type === 'numbered') {
    const num = document.createElement('span');
    num.className = 'cb-num-dot';
    num.textContent = numCount + '.';
    wrap.appendChild(num);
  }

  if (block.type === 'quote') {
    const bar = document.createElement('div');
    bar.className = 'cb-quote-bar';
    wrap.appendChild(bar);
  }

  const el = document.createElement(block.type === 'code' ? 'pre' : 'div');
  el.className = `cb-editable cb-type-${block.type}`;
  el.contentEditable = 'true';
  el.spellcheck = block.type !== 'code';
  el.dataset.placeholder = getPlaceholder(block.type);

  if (block.type === 'todo' && block.checked) el.classList.add('cb-todo-done');

  el.textContent = block.content || '';

  el.addEventListener('keydown', e => onBlockKeydown(e, block, idx, el));
  el.addEventListener('input',   e => onBlockInput(e, block, el));
  el.addEventListener('focus',   ()  => { onBlockFocus(block, idx); updateToolbarActive(); });

  wrap.appendChild(el);
  return wrap;
}

function buildTable(block, idx) {
  const container = document.createElement('div');
  container.className = 'cb-table-wrap';

  const table = document.createElement('table');
  table.className = 'cb-table';

  block.rows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    row.forEach((cell, ci) => {
      const td = document.createElement('td');
      td.contentEditable = 'true';
      td.className = 'cb-table-cell';
      td.textContent = cell;
      td.addEventListener('input', () => { block.rows[ri][ci] = td.textContent; });
      td.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const cells = table.querySelectorAll('td');
          const flat = Array.from(cells);
          const cur = flat.indexOf(td);
          const next = flat[e.shiftKey ? cur - 1 : cur + 1];
          if (next) { next.focus(); placeCaretAtEnd(next); }
        }
      });
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  container.appendChild(table);

  const controls = document.createElement('div');
  controls.className = 'cb-table-controls';

  const addRow = document.createElement('button');
  addRow.className = 'cb-tbl-btn';
  addRow.textContent = '+ Row';
  addRow.onclick = () => {
    block.rows.push(new Array(block.rows[0].length).fill(''));
    renderCanvas();
  };

  const addCol = document.createElement('button');
  addCol.className = 'cb-tbl-btn';
  addCol.textContent = '+ Column';
  addCol.onclick = () => {
    block.rows.forEach(r => r.push(''));
    renderCanvas();
  };

  const delBlock = document.createElement('button');
  delBlock.className = 'cb-tbl-btn cb-tbl-del';
  delBlock.textContent = 'Delete Table';
  delBlock.onclick = () => deleteBlock(idx);

  controls.append(addRow, addCol, delBlock);
  container.appendChild(controls);
  return container;
}

function getPlaceholder(type) {
  const map = {
    text:     "Type '/' for commands…",
    h1:       'Heading 1',
    h2:       'Heading 2',
    h3:       'Heading 3',
    bullet:   'List item',
    numbered: 'List item',
    todo:     'To-do',
    quote:    'Quote',
    code:     'Code',
  };
  return map[type] || '';
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD HANDLERS
// ═══════════════════════════════════════════════════════════════

function onBlockKeydown(e, block, idx, el) {
  if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
    e.preventDefault();
    closeSlashMenu();
    const newBlock = makeBlock('text', '');
    canvasBlocks.splice(idx + 1, 0, newBlock);
    renderCanvas();
    focusBlock(idx + 1);
    return;
  }

  if (e.key === 'Backspace' && getBlockText(el) === '') {
    if (canvasBlocks.length === 1) return;
    e.preventDefault();
    closeSlashMenu();
    deleteBlock(idx, true);
    return;
  }

  if (e.key === 'ArrowUp' && idx > 0) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.startOffset === 0 && range.collapsed) {
      e.preventDefault();
      focusBlock(idx - 1, 'end');
    }
    return;
  }

  if (e.key === 'ArrowDown' && idx < canvasBlocks.length - 1) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.startOffset === (el.textContent?.length || 0) && range.collapsed) {
      e.preventDefault();
      focusBlock(idx + 1);
    }
    return;
  }

  if (e.key === 'Escape') {
    closeSlashMenu();
  }
}

function onBlockInput(e, block, el) {
  block.content = el.textContent || '';

  const text = block.content;

  if (text === '/') {
    openSlashMenu(block, el);
    return;
  }

  if (slashMenuIdx !== null) {
    const menu = document.getElementById('cb-slash-menu');
    if (menu) filterSlashMenu(text.slice(1));
    else closeSlashMenu();
    return;
  }
}

function onBlockFocus(block, idx) {
  if (slashMenuIdx !== null && slashMenuIdx !== idx) {
    closeSlashMenu();
  }
}

// ═══════════════════════════════════════════════════════════════
// SLASH MENU
// ═══════════════════════════════════════════════════════════════

function openSlashMenu(block, el) {
  closeSlashMenu();
  slashMenuIdx = canvasBlocks.findIndex(b => b.id === block.id);

  const rect = el.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = 'cb-slash-menu';
  menu.className = 'cb-slash-menu';

  renderSlashItems(menu, block, '');

  const canvasRect = document.getElementById('canvasPanel').getBoundingClientRect();
  menu.style.top  = (rect.bottom - canvasRect.top + 4) + 'px';
  menu.style.left = (rect.left   - canvasRect.left)    + 'px';

  document.getElementById('canvasPanel').appendChild(menu);
}

function renderSlashItems(menu, block, filter) {
  menu.innerHTML = '';
  const filtered = BLOCK_TYPES.filter(bt =>
    bt.label.toLowerCase().includes(filter.toLowerCase()) ||
    bt.shortcut.includes(filter.toLowerCase())
  );
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'cb-slash-empty';
    empty.textContent = 'No results';
    menu.appendChild(empty);
    return;
  }
  filtered.forEach(bt => {
    const item = document.createElement('div');
    item.className = 'cb-slash-item';
    item.innerHTML = `<span class="cb-slash-icon"><i class="ph ${phosphorIcon(bt.type)}"></i></span><span class="cb-slash-label">${bt.label}</span>`;
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      closeSlashMenu();
      convertBlock(block, bt.type);
    });
    menu.appendChild(item);
  });
}

function filterSlashMenu(query) {
  const menu = document.getElementById('cb-slash-menu');
  if (!menu) return;
  const block = canvasBlocks[slashMenuIdx];
  if (!block) return;
  renderSlashItems(menu, block, query);
}

function closeSlashMenu() {
  const menu = document.getElementById('cb-slash-menu');
  if (menu) menu.remove();
  slashMenuIdx = null;
}

document.addEventListener('mousedown', e => {
  if (!e.target.closest('#cb-slash-menu')) closeSlashMenu();
});

// ═══════════════════════════════════════════════════════════════
// BLOCK OPERATIONS
// ═══════════════════════════════════════════════════════════════

function convertBlock(block, newType) {
  const idx = canvasBlocks.findIndex(b => b.id === block.id);
  if (idx === -1) return;

  const newBlock = makeBlock(newType, '');
  newBlock.id = block.id;
  canvasBlocks[idx] = newBlock;
  renderCanvas();
  focusBlock(idx);
}

function deleteBlock(idx, focusPrev) {
  canvasBlocks.splice(idx, 1);
  if (canvasBlocks.length === 0) canvasBlocks.push(makeBlock('text', ''));
  renderCanvas();
  if (focusPrev) focusBlock(Math.max(0, idx - 1), 'end');
}

function insertBlockAfter(idx, type) {
  const newBlock = makeBlock(type, '');
  canvasBlocks.splice(idx + 1, 0, newBlock);
  renderCanvas();
  focusBlock(idx + 1);
}

function focusBlock(idx, position) {
  requestAnimationFrame(() => {
    const blocks = document.querySelectorAll('.cb-block');
    const wrapper = blocks[idx];
    if (!wrapper) return;
    const el = wrapper.querySelector('[contenteditable]');
    if (!el) return;
    el.focus();
    if (position === 'start') placeCaretAt(el, 0);
    else placeCaretAtEnd(el);
  });
}

function getBlockText(el) {
  return (el.textContent || '').replace(/\u200B/g, '').trim();
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  const sel   = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function placeCaretAt(el, offset) {
  const range = document.createRange();
  const sel   = window.getSelection();
  const node  = el.firstChild || el;
  try { range.setStart(node, Math.min(offset, node.textContent?.length || 0)); }
  catch { range.selectNodeContents(el); range.collapse(true); }
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

// ═══════════════════════════════════════════════════════════════
// TOOLBAR
// ═══════════════════════════════════════════════════════════════

function buildToolbar() {
  const toolbar = document.getElementById('cb-toolbar');
  if (!toolbar) return;
  toolbar.innerHTML = '';
  document.querySelectorAll('.cb-h-submenu').forEach(el => el.remove());

  const buttons = [
    { type: 'text',     title: 'Text' },
    { type: 'heading',  title: 'Heading', isHeading: true },
    { type: 'bullet',   title: 'Bullet List' },
    { type: 'numbered', title: 'Numbered List' },
    { type: 'todo',     title: 'To-do' },
    { type: 'table',    title: 'Table' },
    { type: 'quote',    title: 'Quote' },
    { type: 'code',     title: 'Code' },
    { type: 'divider',  title: 'Divider' },
  ];

  buttons.forEach(btn => {
    if (btn.isHeading) {
      // H tugma + submenu
      const wrap = document.createElement('div');
      wrap.className = 'cb-h-wrap';
      wrap.style.position = 'relative';

      const b = document.createElement('button');
      b.className = 'cb-toolbar-btn cb-h-btn';
      b.title = 'Heading';
      b.innerHTML = '<i class="ph ph-text-h" style="font-size:28px"></i>';

      const sub = document.createElement('div');
      sub.className = 'cb-h-submenu';
      sub.style.display = 'none';
      document.body.appendChild(sub);

      const headingLabels = { h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3' };

      ['h1','h2','h3'].forEach(htype => {
        const hb = document.createElement('button');
        hb.className = 'cb-toolbar-btn cb-h-sub-btn';
        hb.title = headingLabels[htype];
        hb.innerHTML = `<i class="ph ${phosphorIcon(htype)}" style="font-size:26px"></i><span class="cb-h-sub-label">${headingLabels[htype]}</span>`;
        hb.addEventListener('mousedown', e => {
          e.preventDefault();
          sub.style.display = 'none';
          const focused = document.querySelector('.cb-block [contenteditable]:focus');
          const wrapper = focused?.closest?.('[data-block-id]');
          if (wrapper) {
            const id = wrapper.dataset.blockId;
            const block = canvasBlocks.find(b => b.id === id);
            if (block) { convertBlock(block, htype); return; }
          }
          insertBlockAfter(canvasBlocks.length - 1, htype);
        });
        sub.appendChild(hb);
      });

      b.addEventListener('mousedown', e => {
        e.preventDefault();
        const isOpen = sub.style.display !== 'none';
        if (isOpen) {
          sub.style.display = 'none';
        } else {
          const rect = b.getBoundingClientRect();
          const subWidth = 170;
          let left = rect.left;
          if (left + subWidth > window.innerWidth - 10) left = window.innerWidth - subWidth - 10;
          if (left < 10) left = 10;
          sub.style.top = (rect.bottom + 6) + 'px';
          sub.style.left = left + 'px';
          sub.style.display = 'flex';
        }
      });

      document.addEventListener('mousedown', e => {
        if (!wrap.contains(e.target) && !sub.contains(e.target)) sub.style.display = 'none';
      });

      wrap.appendChild(b);
      toolbar.appendChild(wrap);
      return;
    }

    const b = document.createElement('button');
    b.className = 'cb-toolbar-btn';
    const icon = document.createElement('i');
    icon.className = 'ph ' + phosphorIcon(btn.type);
    icon.style.fontSize = '28px';
    b.appendChild(icon);
    b.title = btn.title;
    b.dataset.type = btn.type;
    b.addEventListener('mousedown', e => {
      e.preventDefault();
      const focused = document.querySelector('.cb-block [contenteditable]:focus');
      const wrapper = focused?.closest?.('[data-block-id]');
      if (wrapper) {
        const id = wrapper.dataset.blockId;
        const block = canvasBlocks.find(b => b.id === id);
        if (block) { convertBlock(block, btn.type); return; }
      }
      insertBlockAfter(canvasBlocks.length - 1, btn.type);
    });
    toolbar.appendChild(b);
  });
}

function updateToolbarActive() {
  document.querySelectorAll('.cb-toolbar-btn').forEach(b => b.classList.remove('active'));
  const focused = document.querySelector('.cb-block [contenteditable]:focus');
  const wrapper = focused?.closest?.('[data-block-id]');
  if (!wrapper) return;
  const id = wrapper.dataset.blockId;
  const block = canvasBlocks.find(b => b.id === id);
  if (!block) return;
  const btn = document.querySelector(`.cb-toolbar-btn[data-type="${block.type}"]`);
  if (btn) btn.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

function openCanvas() {
  document.getElementById('canvasPanel').classList.remove('hidden');
  document.getElementById('plusMenu')?.classList.add('hidden');

  if (canvasBlocks.length === 0) canvasBlocks.push(makeBlock('text', ''));
  buildToolbar();
  renderCanvas();
  focusBlock(0);
}

function closeCanvas() {
  closeSlashMenu();
  document.getElementById('canvasPanel').classList.add('hidden');
}

function canvasPDF() {
  const lines = canvasBlocks.map(b => {
    if (b.type === 'divider')  return '---';
    if (b.type === 'table')    return b.rows.map(r => r.join(' | ')).join('\n');
    const prefix = b.type === 'bullet'  ? '• '
                 : b.type === 'todo'    ? (b.checked ? '☑ ' : '☐ ')
                 : b.type === 'quote'   ? '> '
                 : b.type === 'h1'      ? '# '
                 : b.type === 'h2'      ? '## '
                 : b.type === 'h3'      ? '### '
                 : '';
    return prefix + (b.content || '');
  });

  const tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'padding:24px;font-family:Inter,sans-serif;font-size:15px;line-height:1.7;color:#111827;max-width:700px;';

  canvasBlocks.forEach(b => {
    if (b.type === 'divider') {
      const hr = document.createElement('hr');
      hr.style.cssText = 'border:none;border-top:1px solid #e5e7eb;margin:16px 0;';
      tempDiv.appendChild(hr);
      return;
    }
    if (b.type === 'table') {
      const tbl = document.createElement('table');
      tbl.style.cssText = 'border-collapse:collapse;width:100%;margin:12px 0;';
      b.rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
          const td = document.createElement('td');
          td.style.cssText = 'border:1px solid #e5e7eb;padding:8px 12px;';
          td.textContent = cell;
          tr.appendChild(td);
        });
        tbl.appendChild(tr);
      });
      tempDiv.appendChild(tbl);
      return;
    }

    const tagMap = { h1:'h1', h2:'h2', h3:'h3', code:'pre', text:'p', bullet:'p', numbered:'p', todo:'p', quote:'blockquote' };
    const tag = tagMap[b.type] || 'p';
    const el  = document.createElement(tag);
    let text = b.content || '';
    if (b.type === 'bullet')   text = '• ' + text;
    if (b.type === 'todo')     text = (b.checked ? '☑ ' : '☐ ') + text;
    el.textContent = text;
    tempDiv.appendChild(el);
  });

  document.body.appendChild(tempDiv);
  html2pdf(tempDiv, {
    filename: 'canvas-doc.pdf',
    margin: 12,
    jsPDF: { format: 'a4' }
  }).finally(() => document.body.removeChild(tempDiv));
}

function togglePlusMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('plusMenu');
  menu?.classList.toggle('hidden');
}

document.addEventListener('click', () => {
  document.getElementById('plusMenu')?.classList.add('hidden');
});

// ═══════════════════════════════════════════════════════════════
// BLANK PAGE — Notion-style Block Editor (Yangi Sahifa)
// ═══════════════════════════════════════════════════════════════

let bpBlocks = [];
let bpDragSrcIdx = null;
let bpSlashMenuIdx = null;
let bpSlashMenuEl = null;
let _bpFocusAfterRender = null;
let bpSlashSelectedIdx = 0;

function bpGenId() {
  return 'bp_' + Math.random().toString(36).slice(2, 9);
}

function bpMakeBlock(type, content) {
  const b = { id: bpGenId(), type, content: content ?? '' };
  if (type === 'todo')  b.checked = false;
  if (type === 'table') b.rows = [['', '', ''], ['', '', ''], ['', '', '']];
  return b;
}

function bpRender() {
  const editor = document.getElementById('blankPageEditor');
  if (!editor) return;

  const focusedId = document.activeElement?.closest?.('[data-bp-id]')?.dataset?.bpId;
  const sel = window.getSelection();
  const savedRange = (focusedId && sel?.rangeCount) ? sel.getRangeAt(0).cloneRange() : null;

  editor.innerHTML = '';
  if (bpBlocks.length === 0) bpBlocks.push(bpMakeBlock('text', ''));

  let numCount = 0;
  bpBlocks.forEach((block, idx) => {
    if (block.type === 'numbered') numCount++;
    else numCount = 0;
    editor.appendChild(bpCreateWrapper(block, idx, numCount));
  });

  const targetId = _bpFocusAfterRender?.id || focusedId;
  if (targetId) {
    const target = editor.querySelector(`[data-bp-id="${targetId}"] [contenteditable]`);
    if (target) {
      target.focus();
      const pos = _bpFocusAfterRender?.position;
      if (pos === 'start') bpPlaceCaretAt(target, 0);
      else if (savedRange && !_bpFocusAfterRender) {
        try {
          const s = window.getSelection();
          s?.removeAllRanges();
          s?.addRange(savedRange);
        } catch { bpPlaceCaretAtEnd(target); }
      } else {
        bpPlaceCaretAtEnd(target);
      }
    }
  }
  _bpFocusAfterRender = null;
  bpUpdateToolbarActive();
}

function bpCreateWrapper(block, idx, numCount) {
  const wrapper = document.createElement('div');
  wrapper.className = 'bp-block';
  wrapper.dataset.bpId = block.id;
  wrapper.draggable = true;

  wrapper.addEventListener('click', e => {
    if (e.target === wrapper) {
      const ed = wrapper.querySelector('[contenteditable]');
      if (ed) { ed.focus(); bpPlaceCaretAtEnd(ed); }
    }
  });

  // Drag handle
  const handle = document.createElement('div');
  handle.className = 'bp-handle';
  handle.title = 'Drag to reorder';
  handle.innerHTML = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor"><circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/><circle cx="3" cy="6" r="1.2"/><circle cx="7" cy="6" r="1.2"/><circle cx="3" cy="10" r="1.2"/><circle cx="7" cy="10" r="1.2"/></svg>';
  handle.addEventListener('mousedown', e => e.preventDefault());
  wrapper.appendChild(handle);

  // Add button
  const addBtn = document.createElement('button');
  addBtn.className = 'bp-add-btn';
  addBtn.title = 'Add block below';
  addBtn.innerHTML = '<i class="ph-bold ph-plus"></i>';
  addBtn.addEventListener('mousedown', e => { e.preventDefault(); bpInsertAfter(idx, 'text'); });
  wrapper.appendChild(addBtn);

  wrapper.appendChild(bpBuildContent(block, idx, numCount));

  // Drag events
  wrapper.addEventListener('dragstart', e => {
    bpDragSrcIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => wrapper.classList.add('bp-dragging'), 0);
  });
  wrapper.addEventListener('dragend', () => {
    wrapper.classList.remove('bp-dragging');
    document.querySelectorAll('.bp-block').forEach(b => b.classList.remove('bp-drag-top','bp-drag-bottom'));
    bpDragSrcIdx = null;
  });
  wrapper.addEventListener('dragover', e => {
    e.preventDefault();
    document.querySelectorAll('.bp-block').forEach(b => b.classList.remove('bp-drag-top','bp-drag-bottom'));
    const mid = wrapper.getBoundingClientRect().top + wrapper.getBoundingClientRect().height / 2;
    wrapper.classList.add(e.clientY < mid ? 'bp-drag-top' : 'bp-drag-bottom');
  });
  wrapper.addEventListener('dragleave', () => {
    wrapper.classList.remove('bp-drag-top','bp-drag-bottom');
  });
  wrapper.addEventListener('drop', e => {
    e.preventDefault();
    wrapper.classList.remove('bp-drag-top','bp-drag-bottom');
    if (bpDragSrcIdx === null || bpDragSrcIdx === idx) return;
    const mid = wrapper.getBoundingClientRect().top + wrapper.getBoundingClientRect().height / 2;
    const after = e.clientY >= mid;
    const moved = bpBlocks.splice(bpDragSrcIdx, 1)[0];
    let ins = bpDragSrcIdx < idx ? idx - 1 : idx;
    if (after) ins++;
    ins = Math.max(0, Math.min(ins, bpBlocks.length));
    bpBlocks.splice(ins, 0, moved);
    bpDragSrcIdx = null;
    bpRender();
  });

  return wrapper;
}

function bpBuildContent(block, idx, numCount) {
  const wrap = document.createElement('div');
  wrap.className = 'bp-content-wrap';

  if (block.type === 'divider') {
    const hr = document.createElement('div');
    hr.className = 'bp-divider';
    wrap.appendChild(hr);
    const del = document.createElement('button');
    del.className = 'bp-del-btn';
    del.innerHTML = '×';
    del.onclick = () => bpDeleteBlock(idx);
    wrap.appendChild(del);
    return wrap;
  }

  if (block.type === 'table') {
    wrap.appendChild(bpBuildTable(block, idx));
    return wrap;
  }

  if (block.type === 'todo') {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'bp-todo-check';
    cb.checked = !!block.checked;
    cb.addEventListener('change', () => {
      block.checked = cb.checked;
      const el = wrap.querySelector('.bp-editable');
      if (el) el.classList.toggle('bp-todo-done', block.checked);
    });
    wrap.appendChild(cb);
  }
  if (block.type === 'bullet') {
    const dot = document.createElement('span');
    dot.className = 'bp-bullet-dot';
    dot.textContent = '•';
    wrap.appendChild(dot);
  }
  if (block.type === 'numbered') {
    const num = document.createElement('span');
    num.className = 'bp-num-dot';
    num.textContent = numCount + '.';
    wrap.appendChild(num);
  }
  if (block.type === 'quote') {
    const bar = document.createElement('div');
    bar.className = 'bp-quote-bar';
    wrap.appendChild(bar);
  }

  const el = document.createElement(block.type === 'code' ? 'pre' : 'div');
  el.className = 'bp-editable bp-type-' + block.type;
  el.contentEditable = 'true';
  el.spellcheck = block.type !== 'code';
  el.dataset.placeholder = {
    text:'Type '/' for commands…', h1:'Heading 1', h2:'Heading 2', h3:'Heading 3',
    bullet:'List item', numbered:'List item', todo:'To-do', quote:'Quote', code:'// Code here'
  }[block.type] || '';

  if (block.type === 'todo' && block.checked) el.classList.add('bp-todo-done');
  el.textContent = block.content || '';

  el.addEventListener('keydown', e => bpOnKeydown(e, block, idx, el));
  el.addEventListener('input',   e => bpOnInput(e, block, el));
  el.addEventListener('focus',   () => { bpOnFocus(block, idx); bpUpdateToolbarActive(); });

  wrap.appendChild(el);

  const del = document.createElement('button');
  del.className = 'bp-del-btn bp-del-inline';
  del.innerHTML = '×';
  del.onclick = () => bpDeleteBlock(idx);
  wrap.appendChild(del);

  return wrap;
}

function bpBuildTable(block, idx) {
  const container = document.createElement('div');
  container.className = 'bp-table-wrap';
  const table = document.createElement('table');
  table.className = 'bp-table';
  block.rows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    row.forEach((cell, ci) => {
      const td = ri === 0 ? document.createElement('th') : document.createElement('td');
      td.contentEditable = 'true';
      td.className = 'bp-table-cell';
      td.textContent = cell;
      td.addEventListener('input', () => { block.rows[ri][ci] = td.textContent; });
      td.addEventListener('keydown', e => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const cells = Array.from(table.querySelectorAll('th,td'));
          const next = cells[cells.indexOf(td) + (e.shiftKey ? -1 : 1)];
          if (next) { next.focus(); bpPlaceCaretAtEnd(next); }
        }
      });
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  container.appendChild(table);
  const controls = document.createElement('div');
  controls.className = 'bp-table-controls';
  const addRow = document.createElement('button');
  addRow.className = 'bp-tbl-btn';
  addRow.textContent = '+ Row';
  addRow.onclick = () => { block.rows.push(new Array(block.rows[0].length).fill('')); bpRender(); };
  const addCol = document.createElement('button');
  addCol.className = 'bp-tbl-btn';
  addCol.textContent = '+ Column';
  addCol.onclick = () => { block.rows.forEach(r => r.push('')); bpRender(); };
  const delTbl = document.createElement('button');
  delTbl.className = 'bp-tbl-btn bp-tbl-del';
  delTbl.textContent = '✕ Delete Table';
  delTbl.onclick = () => bpDeleteBlock(idx);
  controls.append(addRow, addCol, delTbl);
  container.appendChild(controls);
  return container;
}

// ── Keyboard ──
function bpOnKeydown(e, block, idx, el) {
  if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
    e.preventDefault();
    bpCloseSlash();
    const nb = bpMakeBlock(['bullet','numbered','todo'].includes(block.type) ? block.type : 'text', '');
    bpBlocks.splice(idx + 1, 0, nb);
    _bpFocusAfterRender = { id: nb.id, position: 'start' };
    bpRender();
    return;
  }
  if (e.key === 'Backspace' && (el.textContent || '').trim() === '') {
    if (bpBlocks.length === 1) return;
    e.preventDefault();
    bpCloseSlash();
    const prevId = bpBlocks[idx - 1]?.id;
    bpBlocks.splice(idx, 1);
    if (bpBlocks.length === 0) bpBlocks.push(bpMakeBlock('text', ''));
    if (prevId) _bpFocusAfterRender = { id: prevId, position: 'end' };
    bpRender();
    return;
  }
  if (e.key === 'Tab' && block.type === 'code') {
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
    return;
  }
  if (e.key === 'ArrowUp' && idx > 0) {
    const s = window.getSelection();
    if (s?.rangeCount && s.getRangeAt(0).startOffset === 0 && s.getRangeAt(0).collapsed) {
      e.preventDefault();
      _bpFocusAfterRender = { id: bpBlocks[idx - 1].id, position: 'end' };
      bpRender();
    }
  }
  if (e.key === 'ArrowDown' && idx < bpBlocks.length - 1) {
    const s = window.getSelection();
    const atEnd = s?.rangeCount && s.getRangeAt(0).startOffset === (el.textContent?.length || 0) && s.getRangeAt(0).collapsed;
    if (atEnd) {
      e.preventDefault();
      _bpFocusAfterRender = { id: bpBlocks[idx + 1].id, position: 'start' };
      bpRender();
    }
  }
  if (e.key === 'Escape') bpCloseSlash();
}

function bpOnInput(e, block, el) {
  block.content = el.textContent || '';
  if (block.content === '/') { bpOpenSlash(block, el); return; }
  if (bpSlashMenuIdx !== null) {
    const menu = document.getElementById('bp-slash-menu');
    if (menu) bpFilterSlash(block.content.replace(/^.*\//, '').replace(/^.*\//, ''));
    else bpCloseSlash();
  }
}

function bpOnFocus(block, idx) {
  if (bpSlashMenuIdx !== null && bpSlashMenuIdx !== idx) bpCloseSlash();
}

// ── Slash menu ──
const BP_TYPES = [
  { type:'text',     label:'Text',      icon:'T',    desc:'Plain paragraph' },
  { type:'h1',       label:'Heading 1', icon:'H1',   desc:'Large header' },
  { type:'h2',       label:'Heading 2', icon:'H2',   desc:'Medium header' },
  { type:'h3',       label:'Heading 3', icon:'H3',   desc:'Small header' },
  { type:'bullet',   label:'Bullet',    icon:'•',    desc:'Unordered list' },
  { type:'numbered', label:'Numbered',  icon:'1.',   desc:'Ordered list' },
  { type:'todo',     label:'To-do',     icon:'☐',    desc:'Checkable task' },
  { type:'table',    label:'Table',     icon:'⊞',    desc:'Data table' },
  { type:'quote',    label:'Quote',     icon:'"',    desc:'Blockquote' },
  { type:'code',     label:'Code',      icon:'</>',  desc:'Code block' },
  { type:'divider',  label:'Divider',   icon:'—',    desc:'Horizontal line' },
];

function bpOpenSlash(block, el) {
  bpCloseSlash();
  bpSlashMenuIdx = bpBlocks.findIndex(b => b.id === block.id);
  bpSlashSelectedIdx = 0;
  const menu = document.createElement('div');
  menu.id = 'bp-slash-menu';
  menu.className = 'bp-slash-menu';
  bpSlashMenuEl = menu;
  bpRenderSlashItems(menu, block, '');
  const rect = el.getBoundingClientRect();
  const panel = document.getElementById('blankPagePanel');
  const pr = panel.getBoundingClientRect();
  menu.style.top  = (rect.bottom - pr.top + 4) + 'px';
  menu.style.left = Math.max(8, rect.left - pr.left) + 'px';
  panel.appendChild(menu);
  el.addEventListener('keydown', bpSlashKeyHandler);
}

function bpSlashKeyHandler(e) {
  const menu = document.getElementById('bp-slash-menu');
  if (!menu) return;
  const items = menu.querySelectorAll('.bp-slash-item');
  if (!items.length) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); bpSlashSelectedIdx = (bpSlashSelectedIdx + 1) % items.length; bpHighlightSlash(items); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); bpSlashSelectedIdx = (bpSlashSelectedIdx - 1 + items.length) % items.length; bpHighlightSlash(items); }
  else if (e.key === 'Enter') { e.preventDefault(); items[bpSlashSelectedIdx]?.click(); }
}

function bpHighlightSlash(items) {
  items.forEach((item, i) => item.classList.toggle('bp-slash-selected', i === bpSlashSelectedIdx));
  items[bpSlashSelectedIdx]?.scrollIntoView({ block: 'nearest' });
}

function bpRenderSlashItems(menu, block, filter) {
  menu.innerHTML = '';
  const q = filter.toLowerCase();
  const filtered = BP_TYPES.filter(bt => !q || bt.label.toLowerCase().includes(q) || bt.type.includes(q));
  if (!filtered.length) { menu.innerHTML = '<div class="bp-slash-empty">No results</div>'; return; }
  filtered.forEach((bt, i) => {
    const item = document.createElement('div');
    item.className = 'bp-slash-item' + (i === bpSlashSelectedIdx ? ' bp-slash-selected' : '');
    item.innerHTML = '<span class="bp-slash-icon"><i class="ph ' + phosphorIcon(bt.type) + '"></i></span><span class="bp-slash-meta"><span class="bp-slash-label">' + bt.label + '</span><span class="bp-slash-desc">' + bt.desc + '</span></span>';
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      bpCloseSlash();
      block.content = block.content.replace(/\/[^\/]*$/, '');
      bpConvertBlock(block, bt.type);
    });
    menu.appendChild(item);
  });
}

function bpFilterSlash(query) {
  const menu = document.getElementById('bp-slash-menu');
  if (!menu) return;
  const block = bpBlocks[bpSlashMenuIdx];
  if (!block) return;
  bpSlashSelectedIdx = 0;
  bpRenderSlashItems(menu, block, query);
}

function bpCloseSlash() {
  const el = document.querySelector('.bp-editable:focus');
  if (el) el.removeEventListener('keydown', bpSlashKeyHandler);
  document.getElementById('bp-slash-menu')?.remove();
  bpSlashMenuEl = null;
  bpSlashMenuIdx = null;
}

document.addEventListener('mousedown', e => {
  if (!e.target.closest('#bp-slash-menu')) bpCloseSlash();
});

// ── Block ops ──
function bpConvertBlock(block, newType) {
  const idx = bpBlocks.findIndex(b => b.id === block.id);
  if (idx === -1) return;
  const nb = bpMakeBlock(newType, block.content || '');
  nb.id = block.id;
  bpBlocks[idx] = nb;
  _bpFocusAfterRender = { id: nb.id, position: 'end' };
  bpRender();
}

function bpDeleteBlock(idx) {
  bpBlocks.splice(idx, 1);
  if (bpBlocks.length === 0) bpBlocks.push(bpMakeBlock('text', ''));
  const prev = bpBlocks[Math.max(0, idx - 1)];
  if (prev) _bpFocusAfterRender = { id: prev.id, position: 'end' };
  bpRender();
}

function bpInsertAfter(idx, type) {
  const nb = bpMakeBlock(type, '');
  bpBlocks.splice(idx + 1, 0, nb);
  _bpFocusAfterRender = { id: nb.id, position: 'start' };
  bpRender();
}

function bpPlaceCaretAtEnd(el) {
  const range = document.createRange();
  const sel = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function bpPlaceCaretAt(el, offset) {
  const range = document.createRange();
  const sel = window.getSelection();
  const node = el.firstChild || el;
  try { range.setStart(node, Math.min(offset, node.textContent?.length || 0)); }
  catch { range.selectNodeContents(el); range.collapse(true); }
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

// ── Toolbar ──
function bpBuildToolbar() {
  const toolbar = document.getElementById('bp-toolbar');
  if (!toolbar) return;
  toolbar.innerHTML = '';
  document.querySelectorAll('.bp-h-submenu').forEach(el => el.remove());
  const buttons = [
    { type:'text', title:'Text' },
    { type:'heading', title:'Heading', isHeading: true },
    null,
    { type:'bullet', title:'Bullet List' },
    { type:'numbered', title:'Numbered List' },
    { type:'todo', title:'To-do' },
    null,
    { type:'table', title:'Table' },
    { type:'quote', title:'Quote' },
    { type:'code', title:'Code' },
    { type:'divider', title:'Divider' },
  ];
  buttons.forEach(btn => {
    if (!btn) {
      const sep = document.createElement('div');
      sep.className = 'bp-toolbar-sep';
      toolbar.appendChild(sep);
      return;
    }
    if (btn.isHeading) {
      const wrap = document.createElement('div');
      wrap.className = 'bp-h-wrap';
      wrap.style.position = 'relative';

      const b = document.createElement('button');
      b.className = 'bp-toolbar-btn bp-h-btn';
      b.title = 'Heading';
      b.innerHTML = '<i class="ph ph-text-h"></i>';

      const sub = document.createElement('div');
      sub.className = 'bp-h-submenu';
      sub.style.display = 'none';
      document.body.appendChild(sub);

      const bpHeadingLabels = { h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3' };

      ['h1','h2','h3'].forEach(htype => {
        const hb = document.createElement('button');
        hb.className = 'bp-toolbar-btn bp-h-sub-btn';
        hb.title = bpHeadingLabels[htype];
        hb.innerHTML = `<i class="ph ${phosphorIcon(htype)}"></i><span class="bp-h-sub-label">${bpHeadingLabels[htype]}</span>`;
        hb.addEventListener('mousedown', e => {
          e.preventDefault();
          sub.style.display = 'none';
          const focused = document.querySelector('.bp-block [contenteditable]:focus');
          const wrapper = focused?.closest?.('[data-bp-id]');
          if (wrapper) {
            const block = bpBlocks.find(b => b.id === wrapper.dataset.bpId);
            if (block) { bpConvertBlock(block, htype); return; }
          }
          bpInsertAfter(bpBlocks.length - 1, htype);
        });
        sub.appendChild(hb);
      });

      b.addEventListener('mousedown', e => {
        e.preventDefault();
        const isOpen = sub.style.display !== 'none';
        if (isOpen) {
          sub.style.display = 'none';
        } else {
          const rect = b.getBoundingClientRect();
          const subWidth = 170;
          let left = rect.left;
          if (left + subWidth > window.innerWidth - 10) left = window.innerWidth - subWidth - 10;
          if (left < 10) left = 10;
          sub.style.top = (rect.bottom + 6) + 'px';
          sub.style.left = left + 'px';
          sub.style.display = 'flex';
        }
      });

      document.addEventListener('mousedown', e => {
        if (!wrap.contains(e.target) && !sub.contains(e.target)) sub.style.display = 'none';
      });

      wrap.appendChild(b);
      toolbar.appendChild(wrap);
      return;
    }
    const b = document.createElement('button');
    b.className = 'bp-toolbar-btn';
    const icon = document.createElement('i');
    icon.className = 'ph ' + phosphorIcon(btn.type);
    b.appendChild(icon);
    b.title = btn.title;
    b.dataset.type = btn.type;
    b.addEventListener('mousedown', e => {
      e.preventDefault();
      const focused = document.querySelector('.bp-block [contenteditable]:focus');
      const wrapper = focused?.closest?.('[data-bp-id]');
      if (wrapper) {
        const block = bpBlocks.find(b => b.id === wrapper.dataset.bpId);
        if (block) { bpConvertBlock(block, btn.type); return; }
      }
      bpInsertAfter(bpBlocks.length - 1, btn.type);
    });
    toolbar.appendChild(b);
  });
}

function bpUpdateToolbarActive() {
  document.querySelectorAll('.bp-toolbar-btn').forEach(b => b.classList.remove('active'));
  const focused = document.querySelector('.bp-block [contenteditable]:focus');
  const wrapper = focused?.closest?.('[data-bp-id]');
  if (!wrapper) return;
  const block = bpBlocks.find(b => b.id === wrapper.dataset.bpId);
  if (!block) return;
  const btn = document.querySelector('.bp-toolbar-btn[data-type="' + block.type + '"]');
  if (btn) btn.classList.add('active');
}

// ── PDF ──
function blankPagePDF() {
  const tempDiv = document.createElement('div');
  tempDiv.style.cssText = 'padding:24px;font-family:Inter,sans-serif;font-size:15px;line-height:1.7;color:#111827;max-width:700px;';
  bpBlocks.forEach(b => {
    if (b.type === 'divider') {
      const hr = document.createElement('hr');
      hr.style.cssText = 'border:none;border-top:1px solid #e5e7eb;margin:16px 0;';
      tempDiv.appendChild(hr); return;
    }
    if (b.type === 'table') {
      const tbl = document.createElement('table');
      tbl.style.cssText = 'border-collapse:collapse;width:100%;margin:12px 0;';
      b.rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
          const td = document.createElement('td');
          td.style.cssText = 'border:1px solid #e5e7eb;padding:8px 12px;';
          td.textContent = cell;
          tr.appendChild(td);
        });
        tbl.appendChild(tr);
      });
      tempDiv.appendChild(tbl); return;
    }
    const tagMap = { h1:'h1', h2:'h2', h3:'h3', code:'pre', text:'p', bullet:'p', numbered:'p', todo:'p', quote:'blockquote' };
    const el = document.createElement(tagMap[b.type] || 'p');
    let text = b.content || '';
    if (b.type === 'bullet')   text = '• ' + text;
    if (b.type === 'todo')     text = (b.checked ? '☑ ' : '☐ ') + text;
    el.textContent = text;
    tempDiv.appendChild(el);
  });
  document.body.appendChild(tempDiv);
  html2pdf(tempDiv, { filename: 'yangi-sahifa.pdf', margin: 12, jsPDF: { format: 'a4' } })
    .finally(() => document.body.removeChild(tempDiv));
}

// ── Open / Close ──
function openBlankPage() {
  document.getElementById('msgArea').classList.add('hidden');
  document.getElementById('inputAreaContainer')?.classList.add('hidden');
  document.getElementById('blankPagePanel').classList.remove('hidden');
  if (bpBlocks.length === 0) bpBlocks.push(bpMakeBlock('text', ''));
  bpBuildToolbar();
  bpRender();
  requestAnimationFrame(() => {
    const first = document.querySelector('.bp-block [contenteditable]');
    if (first) { first.focus(); bpPlaceCaretAtEnd(first); }
  });
}

function closeBlankPage() {
  bpCloseSlash();
  document.getElementById('msgArea').classList.remove('hidden');
  document.getElementById('inputAreaContainer')?.classList.remove('hidden');
  document.getElementById('blankPagePanel').classList.add('hidden');
}