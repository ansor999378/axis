'use strict';

const AppState = {
  apiKeys: {
    // ── Bo'lim 1: Matn AI ──
    groq:       '',
    deepseek:   '',
    gemini:     '',
    openai:     '',
    // ── Bo'lim 2: STT (Ovoz → Matn) ──
    sttGroq:    '',
    sttGemini:  '',
    sttOpenai:  '',
    // ── Bo'lim 3: TTS (Matn → Ovoz) ──
    ttsGemini:  '',
    ttsOpenai:  '',
    ttsEleven:  '',
    ttsUnreal:  '',
    ttsAi:      '',
    // ── Web Search ──
    exa:        '',
    tavily:     '',
  },
  isVoice:      false,
  isVoiceInput: false,
  isThinking:   false,
  isWebSearch:  false,
  isBusy:       false,
  conversation: [],
};


window.copyCode = function(btn) {
  const code = decodeURIComponent(btn.getAttribute('data-code'));
const textarea = document.createElement('textarea');
textarea.value = code;
textarea.style.position = 'fixed';  // ✅ qo'sh
textarea.style.top = '0';           // ✅ qo'sh
textarea.style.opacity = '0';       // ✅ qo'sh
document.body.appendChild(textarea);
textarea.select();
document.execCommand('copy');
document.body.removeChild(textarea);

  btn.textContent = 'Copied!';
  btn.style.fontSize = '11px';
  btn.style.fontWeight = '600';
  btn.style.color = '#22c55e';

  setTimeout(() => {
    btn.innerHTML = '<i class="ph ph-copy-simple"></i>';
    btn.style.color = '';
    btn.style.fontSize = '';
    btn.style.fontWeight = '';
  }, 2000);
}

const renderer = new marked.Renderer();
renderer.code = ({ text, lang }) => {
  const language = lang || 'plaintext';
  const highlighted = hljs.getLanguage(language)
    ? hljs.highlight(text, { language }).value
    : hljs.highlightAuto(text).value;
  const escaped = encodeURIComponent(text).replace(/'/g, '%27');
  return `
    <div class="code-block">
      <div class="code-header">
        <span class="code-lang">${language}</span>
        <button class="copy-btn" data-code="${escaped}">
          <i class="ph ph-copy-simple"></i>
        </button>
      </div>
      <pre><code class="hljs language-${language}">${highlighted}</code></pre>
    </div>`;
};
marked.use({ renderer });

// ── Chart renderer — AI writes ```chart JSON, we draw it with Chart.js ──
window._axisChartCounter = 0;
const _origMarkedParse = marked.parse.bind(marked);

function markedParse(src, options) {
  const replaced = src.replace(/```chart\n([\s\S]*?)```/g, (match, json) => {
    const id = 'axis-chart-' + (++window._axisChartCounter);
    return `<div class="axis-chart-wrap" data-chart-id="${id}" data-chart-json="${encodeURIComponent(json.trim())}"></div>`;
  });
  return _origMarkedParse(replaced, options);
}

function renderChartsInBubble(bubble) {
  if (!bubble) return;
  bubble.querySelectorAll('.axis-chart-wrap[data-chart-json]').forEach(wrap => {
    if (wrap.dataset.rendered) return;
    wrap.dataset.rendered = '1';
    try {
      const raw = decodeURIComponent(wrap.dataset.chartJson);
      const cfg = JSON.parse(raw);
      const id = wrap.dataset.chartId || ('axis-chart-' + Date.now());
      wrap.innerHTML = '<canvas id="' + id + '" class="axis-chart-canvas"></canvas>';
      const ctx = document.getElementById(id).getContext('2d');
      new Chart(ctx, cfg);
    } catch(e) {
      wrap.innerHTML = '<div class="axis-chart-error">Chart error: ' + e.message + '</div>';
    }
  });
}

document.addEventListener('click', function(e) {
  if (e.target.closest('.copy-btn')) {
    window.copyCode(e.target.closest('.copy-btn'));
  }
});
/* ═══════════════════════════════════════════════════════════════
   2. API SERVICE — all network calls
   ─────────────────────────────────────────────────────────────
   Every fetch() lives here. No DOM access. Returns data or throws.
═══════════════════════════════════════════════════════════════ */
/**
 * ==============================================================
 * BU YERDA: APIService – barcha tarmoq so‘rovlari shu modulda
 * yig‘ilgan. Tarkibida ikkita asosiy funksiya:
 *   callTavily() – Internet qidiruvi
 *   callAI()     – Sun’iy intellekt modeliga so‘rov yuborish
 * Bu modul DOM bilan ishlamaydi, faqat ma’lumot qaytaradi yoki
 * xatolik chiqaradi.
 * ==============================================================
 */
const APIService = {

  async fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  },

  async callTavily(query) {

    // Exa bor bo'lsa — Exa ishlatadi (tezroq)
    if (AppState.apiKeys.exa) {
      const res = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': AppState.apiKeys.exa
        },
        body: JSON.stringify({
          query: query,
          numResults: 6,
          useAutoprompt: true,
          contents: { text: true }
        }),
      });
      if (!res.ok) throw new Error(`Exa error: ${res.status}`);
      const data = await res.json();
      if (!data.results?.length) throw new Error('No results found.');
      return {
        context: data.results.map(r => `[${r.title}]\n${r.text}`).join('\n\n---\n\n'),
        sources: data.results.map(r => ({
          title: r.title,
          url: r.url,
          domain: new URL(r.url).hostname
        }))
      };
    }

    // Tavily fallback
    if (!AppState.apiKeys.tavily) {
      throw new Error('Exa yoki Tavily key kerak. Settings da qo\'ying.');
    }
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key:             AppState.apiKeys.tavily,
        query:               query,
        search_depth:        'advanced',
        max_results:         6,
        include_answer:      true,
        include_raw_content: true,
        include_images:      false,
      }),
    });

    if (!res.ok) throw new Error(`Tavily API error: ${res.status}`);

    const data = await res.json();
    if (!data.results?.length) throw new Error('No web results found.');

    const answer = data.answer ? `SUMMARY: ${data.answer}\n\n---\n\n` : '';
    const body = answer + data.results
      .map((r, i) => `[${i+1}] ${r.title}\nURL: ${r.url}\n${r.raw_content || r.content}`)
      .join('\n\n---\n\n');

    return {
      context: body,
      sources: data.results.map(r => ({
        title:  r.title,
        url:    r.url,
        domain: new URL(r.url).hostname,
      })),
    };
  },



async callAI(userQuery, webContext, useThinkingModel, onChunk = null) {

  const systemPrompt = `You are Axis AI — a world-class intelligent assistant built for clarity, depth, and precision.

═══════════════════════════════════════
IDENTITY
═══════════════════════════════════════
- You are Axis AI. Never reveal the underlying model.
- You have deep expertise across all domains: science, engineering, business, law, medicine, philosophy, and more.
- You think before you speak. Every response is the result of careful reasoning.

═══════════════════════════════════════
LANGUAGE (HIGHEST PRIORITY)
═══════════════════════════════════════
- Always respond in the exact language the user writes in.
- Uzbek → Uzbek. Russian → Russian. English → English.
- Never mix languages unless the user does.
- Never include raw URLs in your response — sources are shown separately.

═══════════════════════════════════════
THINKING & REASONING
═══════════════════════════════════════
Before every response:
1. Identify the true intent behind the question — not just the surface words.
2. Consider edge cases, alternative interpretations, and hidden assumptions.
3. Think step by step for complex problems.
4. Prioritize accuracy and depth over speed.

═══════════════════════════════════════
RESPONSE QUALITY
═══════════════════════════════════════
- Write like a brilliant friend who happens to be an expert — warm, direct, no fluff.
- Never start with filler: no "Great question!", no "Certainly!", no repeating the question.
- Cut every unnecessary word. Every sentence must earn its place.
- Be concise but never shallow. Short answers should still be insightful.
- When something is complex, make it simple. When something is simple, don't overcomplicate it.

═══════════════════════════════════════
FORMAT
═══════════════════════════════════════
- Simple question → 2-4 sharp sentences. No dividers needed.
- Complex question → clearly separated blocks with dividers only where truly needed.
- Each block starts with a bold emoji header: **🎯 Header**
- Separate every block with: ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Maximum 2-3 blocks per response. Never more.
- Use **bold** for key concepts, code blocks for all code.
- Use bullet lists only when genuinely listing items — not as a default.
- Never use --- or ___ horizontal lines.
- For numbers and statistics — present them cleanly in a simple table.
- End complex responses with a **💡 Conclusion** block. Simple responses need no conclusion block.

═══════════════════════════════════════
HONESTY & ACCURACY
═══════════════════════════════════════
- Never invent facts, numbers, dates, names, or URLs.
- "I don't know" is always better than a confident guess.
- Clearly distinguish between confirmed facts and your analysis/opinion.
- If web search is off and the question needs current data, say so directly.

═══════════════════════════════════════
WEB SEARCH (when results are provided)
═══════════════════════════════════════
- Treat search results as ground truth — never contradict them.
- Base your answer ENTIRELY on the provided results.
- Extract exact dates from results — never guess or approximate.
- Give rich, detailed answers drawn directly from search context.
- Never say "I'm not certain" when results are clearly available.

═══════════════════════════════════════
DOCUMENT GENERATION
═══════════════════════════════════════
- If the user requests a PDF or document, write the full content in clean Markdown.
- The app handles PDF generation automatically — never say "I can't create files."
- Structure documents professionally: title, sections, clear hierarchy.`;

  const wantsStructuredLesson = /(?:lesson|plan|roadmap|dars|reja|grammar|vocabulary|word list|words|so'z|soz|jadval|table|teach me|study plan|learning plan|A1|A2|B1|B2|C1)/i.test(userQuery);

  const lessonFormatPrompt = wantsStructuredLesson
    ? `
For lesson/plan requests, output raw HTML only.
- Start with <div>.
- Use plain HTML only: headings, paragraphs, lists, tables, hr, strong, em.
- No inline styles, no colored text, no decorative boxes.
- All text must be black.
- h1 for main title, h2 for sections, h3 for sub-sections.
- Must include these sections in exact order:
  1. 🎯 Goal
  2. 📅 Duration
  3. 🎨 Style
  4. 📚 Content
  5. 📝 Homework
- Top summary: single short block with Goal / Duration / Style.
- Use tables for vocabulary: Inglizcha | O'zbekcha | Talaffuz
- Every section separated by ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Tables with thin light-gray borders.
- Numbered sections and clear subsection titles.
- Do NOT use Markdown for lesson content.`
    : '';

    const isVoice = (AppState.conversation || []).filter(m => m.role === 'user').pop()?.source === 'voice';

    const runtimeSystemPrompt = `You are Axis AI, a precise and helpful assistant.

Rules:
- Reply in the user's language only.
- Do not reveal the underlying model.
- Be concise, accurate, and direct.
- If you are unsure, say so instead of guessing.
- Do not include raw URLs in the answer text.
- If web results are provided, use only those results.
- For PDFs/documents, return clean Markdown content.
- If the answer is HTML, do not wrap it in triple backticks or markdown fences.
- When the request is a lesson or plan, you must follow the lesson template and include the emoji headers exactly.

CHARTS (Line chart only — business/economics data):
- Use a chart ONLY when the user asks to visualize time-series or trend data (revenue over months, growth rates, comparisons over time).
- Do NOT use charts for simple calculations, text explanations, or single numbers.
- When a chart is needed, output a fenced code block with language "chart" containing valid Chart.js config JSON:
\`\`\`chart
{
  "type": "line",
  "data": {
    "labels": ["Jan", "Feb", "Mar"],
    "datasets": [{
      "label": "Revenue ($)",
      "data": [500, 700, 600],
      "borderColor": "#6366f1",
      "backgroundColor": "rgba(99,102,241,0.08)",
      "borderWidth": 2.5,
      "pointRadius": 4,
      "tension": 0.4,
      "fill": true
    }]
  },
  "options": {
    "responsive": true,
    "plugins": { "legend": { "display": true } },
    "scales": { "y": { "beginAtZero": false } }
  }
}
\`\`\`
- Always add a brief text explanation before or after the chart.
- Use real numbers from the user's question, never invent data.
- Keep labels short (3-6 words max).
- Only use type "line". Never use bar, pie, doughnut, or other types.
${lessonFormatPrompt}
${isVoice ? '\n- VOICE INPUT: The user is speaking via voice. Respond VERY briefly (1-3 short sentences). Skip markdown, formatting, lists, and emojis. Be direct and conversational.' : ''}`.trim();

    const voiceTag = isVoice ? '[Voice] ' : '';
    const newUserContent = webContext
      ? `IMPORTANT: Today is ${new Date().toLocaleDateString('en-US', {weekday:'long', year:'numeric', month:'long', day:'numeric'})}.

You MUST use the following web search results to answer. Do NOT say you lack internet access — the results are already provided below:

${webContext}

---
Now answer this question using ONLY the above results: ${voiceTag}${userQuery}`
      : voiceTag + userQuery;

    const maxHistoryTurns = AppState.isWebSearch ? 2 : 6;
    const recentHistory = (AppState.conversation || [])
      .slice(0, -1)
      .filter(m => m && m.content)
      .slice(-maxHistoryTurns)
      .map(m => ({ role: m.role, content: String(m.content) }));

    const requestTimeoutMs = 45000;
    const timeoutMessage = 'Request timed out. Please shorten the prompt or try again.';
    const isProbablyTooLargeError = message =>
      /context|token|length|too large|maximum|payload|input/i.test(message || '');
    const formatProviderError = (providerName, errorMessage, status) => {
      const message = String(errorMessage || '').trim();
      if (!message) return `${providerName}: ${status}`;
      if (isProbablyTooLargeError(message)) {
        return `${providerName}: prompt too long for this model. Shorten the message or reduce chat history.`;
      }
      return `${providerName}: ${message}`;
    };

const providers = [
  {
    name:  'Gemini 3.1 Flash Lite',
    get key() { return AppState.apiKeys.gemini; },
    url:   'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent',
    model: 'gemini-2.0-flash-lite',
  },
  {
    name:  'Gemini 2.5 Flash',
    get key() { return AppState.apiKeys.gemini; },
    url:   'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    model: 'gemini-2.5-flash',
  },
  {
    name:  'Gemini 2.5 Flash Lite',
    get key() { return AppState.apiKeys.gemini; },
    url:   'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-06-17:generateContent',
    model: 'gemini-2.5-flash-lite-preview-06-17',
  },
  {
    name:  'Groq',
    get key() { return AppState.apiKeys.groq; },
    url:   'https://api.groq.com/openai/v1/chat/completions',
    model: useThinkingModel ? 'deepseek-r1-distill-llama-70b' : 'llama-3.3-70b-versatile',
  },
  {
    name:  'DeepSeek',
    get key() { return AppState.apiKeys.deepseek; },
    url:   'https://api.deepseek.com/chat/completions',
    model: useThinkingModel ? 'deepseek-reasoner' : 'deepseek-chat',
  },
  {
    name:  'OpenAI',
    get key() { return AppState.apiKeys.openai; },
    url:   'https://api.openai.com/v1/chat/completions',
    model: useThinkingModel ? 'o1' : 'gpt-4o-mini',
  },
];

let lastError = 'No API keys configured. Open Settings to add one.';
const aiMsg = AppState.conversation[AppState.conversation.length - 1];
let fullText = '';
let charQueue = [];
let isTyping = false;

function renderAIText(text) {
  aiMsg.content = unwrapAssistantContent(text);
  const bubbles = document.querySelectorAll('.msg-bubble');
  const last = bubbles[bubbles.length - 1];
  if (last) {
    const cleanText = unwrapAssistantContent(text);
    const isHTML = cleanText.startsWith('<');
    last.innerHTML = DOMPurify.sanitize(
      isHTML ? cleanText : markedParse(cleanText),
      {
      ADD_ATTR: ['class', 'data-chart-id', 'data-chart-json', 'data-rendered'],
      ADD_TAGS: ['span', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'canvas'],
      FORCE_BODY: false,
      }
    );
    renderChartsInBubble(last);
  }
}

function startTyping() {
  if (isTyping) return;
  isTyping = true;
  function tick() {
    if (charQueue.length === 0) {
      isTyping = false;
      return;
    }
    const char = charQueue.shift();
    fullText += char;
    renderAIText(fullText);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function queueTyping(text) {
  if (!text) return;
  charQueue.push(...text.split(''));
  startTyping();
  if (typeof onChunk === 'function') {
    try { onChunk(text); } catch (e) { console.error('onChunk error:', e); }
  }
}

async function waitForTyping() {
  await new Promise(resolve => {
    function wait() {
      if (charQueue.length === 0 && !isTyping) {
        resolve();
      } else {
        setTimeout(wait, 50);
      }
    }
    wait();
  });
}

for (const provider of providers) {
  if (!provider.key) continue;

  try {
    let res;

    if (provider.name.startsWith('Gemini')) {
      // Gemini — Authorization yo'q, key URL da, format boshqacha
      let geminiHistory = recentHistory;
      let geminiBody = {
        system_instruction: { parts: [{ text: runtimeSystemPrompt }] },
        contents: [
          ...geminiHistory.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
          })),
          { role: 'user', parts: [{ text: newUserContent }] }
        ]
      };

      const geminiUrl = `${provider.url}?key=${provider.key}`;
      for (let attempt = 0; attempt < 4; attempt++) {
        res = await this.fetchWithTimeout(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody),
        }, requestTimeoutMs);

        if (res.ok) break;

        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error?.message || '';
        if (isProbablyTooLargeError(errMsg) && geminiHistory.length > 0) {
          geminiHistory = geminiHistory.slice(Math.max(1, Math.floor(geminiHistory.length / 2)));
          geminiBody.contents = [
            ...geminiHistory.map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })),
            { role: 'user', parts: [{ text: newUserContent }] }
          ];
          continue;
        }
        lastError = formatProviderError(provider.name, errMsg, res.status);
        break;
      }
      if (!res.ok) continue;

      const data = await res.json();
      const geminiText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      queueTyping(geminiText);
      await waitForTyping();
      await new Promise(r => setTimeout(r, 50));
      document.querySelectorAll('.msg-bubble pre code').forEach(block => {
        const text = block.innerText;
        block.innerHTML = hljs.highlightAuto(text).value;
      });
      return fullText;

    } else {
      // Groq, DeepSeek, OpenAI — standart
      res = await this.fetchWithTimeout(provider.url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${provider.key}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          model:    provider.model,
          stream:   true,
          messages: [
            { role: 'system', content: runtimeSystemPrompt },
            ...recentHistory,
            { role: 'user', content: newUserContent },
          ],
        }),
      }, requestTimeoutMs);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        lastError = formatProviderError(provider.name, errData.error?.message, res.status);
        continue;
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const token = JSON.parse(data).choices?.[0]?.delta?.content || '';
            if (!token) continue;
            queueTyping(token);
          } catch {}
        }
      }

      await waitForTyping();

      await new Promise(r => setTimeout(r, 50));
      document.querySelectorAll('.msg-bubble pre code').forEach(block => {
        const text = block.innerText;
        block.innerHTML = hljs.highlightAuto(text).value;
      });

      return fullText;
    }

  } catch (err) {
    lastError = err.name === 'AbortError'
      ? `${provider.name}: ${timeoutMessage}`
      : `${provider.name}: ${err.message}`;
  }
}

throw new Error(lastError);
  },
};

/* ═══════════════════════════════════════════════════════════════
   3. UI CONTROLLER — all DOM operations
   ─────────────────────────────────────────────────────────────
   No fetch() here. Only reads from AppState and updates the DOM.
═══════════════════════════════════════════════════════════════ */
/**
 * ==============================================================
 * BU YERDA: UIController – ekrandagi barcha ko‘rinishlar bilan
 * ishlaydi. Hech qanday tarmoq so‘rovi yo‘q, faqat DOM
 * elementlarini o‘qish/yozish va AppState’dagi ma’lumotlarni
 * ko‘rsatish uchun ishlatiladi.
 * ==============================================================
 */
const UIController = {

  // Cache frequently-accessed elements at startup
  els: {},

  /** Call once after DOM is ready — caches element references */
  /**
   * ------------------------------------------------------------
   * init(): DOM tayyor bo‘lgach, kerakli elementlarni topib
   * xotirada saqlab qo‘yadi (keyin tezroq ishlash uchun).
   * ------------------------------------------------------------
   */
  init() {
    this.els = {
      msgArea:     document.getElementById('msgArea'),
      inp:         document.getElementById('inp'),
      sendBtn:     document.getElementById('sendBtn'),
      webBtn:      document.getElementById('webBtn'),
      modeTrigger: document.getElementById('modeTrigger'),
      modeName:    document.getElementById('modeName'),
      modeDropdown:document.getElementById('modeDropdown'),
      fastItem:    document.getElementById('fastItem'),
      thinkItem:   document.getElementById('thinkItem'),
      searching:   document.getElementById('searchingIndicator'),
      overlay:     document.getElementById('overlay'),
    };
  },

  /* ── Empty state ── */
  /**
   * renderEmptyState(): Agar suhbat bo‘sh bo‘lsa, ekranga
   * “Welcome to Axis AI” ko‘rinishini chiqaradi.
   */
  renderEmptyState() {
    this.els.msgArea.innerHTML = `
      <div class="msg-wrap">
        <div class="empty-state-inner">
          <div class="empty-logo">Ax</div>
          <h2 class="empty-title">Welcome to Axis AI</h2>
          <p class="empty-sub">Ask anything, upload a file, or enable web search</p>
        </div>
      </div>`;
  },

  /* ── Full conversation render ── */
  /**
   * renderConversation(): AppState.conversation ichidagi barcha
   * xabarlarni ekranga chiqaradi. Agar bo‘sh bo‘lsa, bo‘sh holat
   * ko‘rsatiladi.
   */


  renderConversation() {
    if (!AppState.conversation.length) return this.renderEmptyState();

    const html = AppState.conversation.map((msg, idx) =>
      msg.role === 'user'
        ? this._renderUserMessage(msg, idx)
        : this._renderAIMessage(msg)
    ).join('');

    this.els.msgArea.innerHTML = `<div class="msg-wrap">${html}</div>`;
    this.els.msgArea.scrollTop = this.els.msgArea.scrollHeight;
    // Render any charts in loaded messages
    document.querySelectorAll('.msg-bubble').forEach(b => renderChartsInBubble(b));
  },

  /** @private — renders a single user message bubble */
  /**
   * _renderUserMessage(msg): Foydalanuvchi xabarini HTML ko‘rinishida
   * qaytaradi (qabariq pufakcha). Xavfsizlik uchun maxsus belgilar
   * escape qilinadi.
   */
_renderUserMessage(msg, index) {
  return `
    <div class="msg-block user-message" data-msg-index="${index}">
      <div class="msg-content">
        <div class="msg-bubble">${escapeHtml(msg.content)}</div>
        <div class="user-msg-actions">
          <button class="user-action-btn" onclick="editUserMsg(this)" title="Tahrirlash">
            <i class="ph ph-pencil"></i>
          </button>
          <button class="user-action-btn" onclick="copyUserMsg(this)" title="Nusxa olish">
            <i class="ph ph-copy-simple"></i>
          </button>
        </div>
      </div>
    </div>`;
},
  /** @private — renders a single AI message bubble with optional thinking block */
  /**
   * _renderAIMessage(msg): Sun’iy intellekt xabarini ko‘rsatadi.
   * Agar fikrlash qadamlari (thinkingSteps) mavjud bo‘lsa, ularni
   * akkordeon ko‘rinishida ko‘rsatadi. Agar matn hali bo‘sh bo‘lsa,
   * “thinking…” yozuvi chiqadi.
   */


_renderAIMessage(msg) {
  const thinkingHtml = (msg.thinkingSteps?.length)
    ? `<div class="thinking-block">
        <div class="thinking-header"
             onclick="this.nextElementSibling.classList.toggle('hidden-steps')">
           <i class="ph ph-caret-down"></i>
           Thinking Process (${msg.thinkingSteps.length} step${msg.thinkingSteps.length > 1 ? 's' : ''})
         </div>
         <div class="thinking-steps">
           ${msg.thinkingSteps.map(s =>
             `<div class="thinking-step">
                 <span class="thinking-step-icon"><i class="ph ph-check"></i></span>
                <span>${s}</span>
              </div>`
           ).join('')}
         </div>
       </div>`
    : '';

  const pdfBtn = msg.showPDF
    ? '<button class="pdf-btn" onclick="generatePDF(this)"><i class="ph ph-download-simple"></i> PDF yuklab olish</button>'
    : '';
const sourcesHtml = (msg.sources?.length)
  ? `<div class="sources-chips">
       ${msg.sources.slice(0, 3).map(s => `
         <a href="${s.url}" target="_blank" class="source-chip">
           <img src="https://www.google.com/s2/favicons?domain=${s.domain}&sz=12" />
           <span>${s.domain}</span>
         </a>`
       ).join('')}
       ${msg.sources.length > 3 ? `<span class="source-more">+${msg.sources.length - 3}</span>` : ''}
     </div>`
  : '';


  const cleanContent = unwrapAssistantContent(msg.content);
  const isHTML = cleanContent.startsWith('<');
const contentHtml = cleanContent
  ? DOMPurify.sanitize(
      isHTML ? cleanContent : marked.parse(cleanContent),
      {
        ADD_TAGS: ['table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'div', 'span', 'section'],
        ADD_ATTR: ['class', 'id'],
      }
    )
  : '<span class="thinking-dot"></span>';


return `
  <div class="msg-block ai-message">
    <div class="msg-content">
      ${thinkingHtml}
      <div class="msg-bubble">${contentHtml}</div>
      ${pdfBtn}
      ${sourcesHtml}
      <div class="msg-actions">
        <button class="action-btn" onclick="copyMsg(this)" title="Copy">
          <i class="ph ph-copy-simple"></i>
        </button>
        <button class="action-btn" onclick="likeMsg(this)" title="Like">
          <i class="ph ph-thumbs-up"></i>
        </button>
        <button class="action-btn" onclick="dislikeMsg(this)" title="Dislike">
          <i class="ph ph-thumbs-down"></i>
        </button>
      </div>
    </div>
  </div>`;
},






  /* ── Searching indicator (amber pill + spinner) ──
     Appears ONLY when Tavily fetch is in flight.
     Visually distinct from the thinking steps block. */
  /**
   * showSearchingIndicator(): Internet qidiruvi boshlanganda
   * sariq to‘lqinli indikatorni ko‘rsatadi.
   */
  showSearchingIndicator() {
    this.els.searching.classList.remove('hidden');
  },

  /**
   * hideSearchingIndicator(): Qidiruv tugagach, indikatorni yashiradi.
   */
  hideSearchingIndicator() {
    this.els.searching.classList.add('hidden');
  },

  /* ── Web search button state ── */
  /**
   * updateWebBtn(): Internet qidiruvi tugmasi holatini yangilaydi
   * (faol yoki nofaol ko‘rinishda).
   */
  updateWebBtn() {
    this.els.webBtn.classList.toggle('active', AppState.isWebSearch);
  },

  /* ── Mode dropdown state ── */
  /**
   * updateModeDropdown(): “Tez” yoki “O‘ylash” rejimi menyusini
   * yangilaydi, belgilarni va tugma matnini moslashtiradi.
   */
  updateModeDropdown() {
    const thinking = AppState.isThinking;

    // Update trigger button appearance
    this.els.modeName.textContent    = thinking ? 'Thinking' : 'Fast';
    this.els.modeTrigger.classList.toggle('thinking-active', thinking);

    this.els.fastItem.classList.toggle('active', !thinking);
    this.els.thinkItem.classList.toggle('active', thinking);
  },

  /* ── Send button enabled/disabled ── */
  /**
   * setSendBusy(busy): Jo‘natish tugmasini bandlik holatiga qarab
   * yoqadi yoki o‘chiradi.
   */
  setSendBusy(busy) {
    this.els.sendBtn.disabled = busy;
    AppState.isBusy = busy;
  },

  /* ── Close dropdown when clicking outside ── */
  /**
   * closeDropdown(): Ochilgan rejim menyusini yopish (tashqariga
   * bosilganda ishlatiladi).
   */
  closeDropdown() {
    this.els.modeDropdown.classList.remove('open');
  },
};


const ChatController = {

  /**
   * sendMessage — main entry point when user submits a message.
   *
   * Flow:
   *  1. Validate input and guard against concurrent sends
   *  2. Push user message → push empty AI placeholder → render
   *  3. [INDEPENDENT] If isWebSearch=true → show spinner → call Tavily
   *  4. [INDEPENDENT] If isThinking=true  → use reasoning model
   *  5. Call AI with (query, webContext, useThinkingModel)
   *  6. Update AI placeholder with response → hide spinner → save
   */
  /**
   * ------------------------------------------------------------
   * sendMessage(): Asosiy jo‘natish funksiyasi.
   * 1. Kiritilgan matnni tekshiradi, bandlikni bloklaydi.
   * 2. Foydalanuvchi va bo‘sh AI xabarini holatga qo‘shadi.
   * 3. Agar internet qidiruvi yoqilgan bo‘lsa, Tavily chaqiriladi.
   * 4. Agar o‘ylash rejimi yoqilgan bo‘lsa, chuqur model ishlatiladi.
   * 5. AI’dan javob olinadi va AI xabariga yoziladi.
   * 6. Bandlik ochiladi, tarix saqlanadi, ekran yangilanadi.
   * ------------------------------------------------------------
   */
  
  async sendMessage() {
    const inp = UIController.els?.inp;
    if (!inp) return;
    const q = inp.value.trim();
    if (!q || AppState.isBusy) return;

    // ── Lock UI ──
    UIController.setSendBusy(true);
    UIController.els.inp.value = '';
    resize(UIController.els.inp);

    try {

    // ── Add messages to state ──
    AppState.conversation.push({
      role: 'user',
      content: q,
      source: AppState.isVoiceInput ? 'voice' : 'text',
      time: getTime(),
    });

    const aiIdx = AppState.conversation.push({
      role:          'assistant',
      content:       '',       // filled after API resolves
      thinkingSteps: [],
      time:          getTime(),
    }) - 1;

    UIController.renderConversation();

    // ── Step 3: Web search (INDEPENDENT flag) ──
    let webContext = '';

    if (AppState.isWebSearch) {
if (!AppState.apiKeys.tavily && !AppState.apiKeys.exa) {        // Graceful degradation: note the missing key but continue
        AppState.conversation[aiIdx].thinkingSteps.push(
          'Web search skipped — Tavily key not set in Settings.'
        );
        UIController.renderConversation();
      } else {
        // Show the distinct amber "Searching…" pill

UIController.showSearchingIndicator();
AppState.conversation[aiIdx].thinkingSteps.push('Searching the web…');
UIController.renderConversation();

try {
  const result = await APIService.callTavily(q);
  AppState.conversation[aiIdx].sources = result.sources;
  webContext = result.context;
  AppState.conversation[aiIdx].thinkingSteps.push(
    `Found ${result.sources.length} result(s). Synthesizing…`
  );
} catch (err) {
  AppState.conversation[aiIdx].thinkingSteps.push(
    `Web search failed (${err.message}). Using internal knowledge.`
  );
} finally {
          // Always hide the spinner, whether search succeeded or not
          UIController.hideSearchingIndicator();
          UIController.renderConversation();
        }
      }
    }

    // ── Step 4 & 5: Call AI (isThinking controls MODEL CHOICE only) ──
    // Ovozda javob berish kerakmi? Ovozli kirish bo'lsa YOKI ovozli sessiya yoniq bo'lsa.
    const shouldSpeak = AppState.isVoiceInput || (typeof VoiceController !== 'undefined' && VoiceController.isSessionActive);
    AppState.isVoiceInput = false;

      if (AppState.isThinking) {
        AppState.conversation[aiIdx].thinkingSteps.push(
          'Engaging deep reasoning model…'
        );
        UIController.renderConversation();
      }

    // Jonli ovoz: AI yozayotgan paytda jumlama-jumla darhol gapiradi.
    const hasTTSKey = !!(AppState.apiKeys.ttsEleven || AppState.apiKeys.ttsUnreal || AppState.apiKeys.ttsGemini || AppState.apiKeys.ttsOpenai || AppState.apiKeys.ttsAi);
    const canStreamSpeak = shouldSpeak && hasTTSKey && typeof VoiceController !== 'undefined'
      && typeof VoiceController.beginSpeechStream === 'function';
    if (canStreamSpeak) {
      VoiceController.beginSpeechStream();
    }

    const onChunk = canStreamSpeak ? (chunk) => VoiceController.feedSpeech(chunk) : null;

     const response = await APIService.callAI(q, webContext, AppState.isThinking, onChunk);


const wantsPDF = /pdf|document|doc|hujjat|yarat|tayyorla/i.test(q);
AppState.conversation[aiIdx].content  = unwrapAssistantContent(response);
AppState.conversation[aiIdx].showPDF  = wantsPDF;
AppState.conversation[aiIdx].pdfTitle = q.slice(0, 40);

// Javob darhol ekranga chiqsin.
UIController.renderConversation();

// Qolgan matnni gapirib bo'lguncha kutamiz (oqim tugaydi).
if (canStreamSpeak) {
  await VoiceController.endSpeechStream();
}

    } catch (err) {
      if (typeof VoiceController !== 'undefined' && typeof VoiceController.stopPlayback === 'function') {
        VoiceController.stopPlayback();
      }
      AppState.conversation[aiIdx].content = `**Error:** ${err.message}`;
    } finally {
UIController.setSendBusy(false);
    }

if (shouldSpeak && typeof VoiceController?.resumeIfNeeded === 'function') {
  await VoiceController.resumeIfNeeded();
}

saveHistory();
setTimeout(() => {
  document.querySelectorAll('.msg-bubble pre code').forEach(block => {
    const text = block.innerText;
    block.innerHTML = hljs.highlightAuto(text).value;
  });
}, 1000);



const lastMsg = AppState.conversation[AppState.conversation.length - 1];
if (lastMsg.sources?.length || lastMsg.showPDF) {
  UIController.renderConversation();
}
  },
};
/* ═══════════════════════════════════════════════════════════════
   5. UTILITY HELPERS
═══════════════════════════════════════════════════════════════ */
/**
 * ==============================================================
 * BU YERDA: Yordamchi funksiyalar – vaqt olish, tarixni saqlash,
 * xavfsiz HTML escape qilish kabi kichik vazifalar.
 * ==============================================================
 */

/** Returns current time as HH:MM */
/**
 * getTime(): Hozirgi vaqtni HH:MM formatda qaytaradi.
 */
function getTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

/** Saves conversation to localStorage */
/**
 * saveHistory(): Joriy suhbatni brauzer xotirasiga (localStorage) yozadi.
 */
function saveHistory() {
  saveCurrentChat();
  renderChatHistory();
}


/**
 * escapeHtml(str): Foydalanuvchi kiritgan matndagi HTML maxsus
 * belgilarni zararsizlantiradi (XSS hujumidan himoya).
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function unwrapAssistantContent(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/^```(?:html|xml|plaintext|text)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  if (fenced) return fenced[1].trim();
  return raw;
}
/* ═══════════════════════════════════════════════════════════════
   6. GLOBAL FUNCTIONS (called directly from HTML attributes)
   ─────────────────────────────────────────────────────────────
   These are thin wrappers. They do the minimum needed and delegate
   to the appropriate controller or module.
═══════════════════════════════════════════════════════════════ */

/** Called by send button and onKey() */
/**
 * send(): Yuborish tugmasi yoki Enter bosilganda xabar jo‘natadi.
 */
function send() {
  ChatController.sendMessage();
}
/** Called by textarea oninput — auto-grows height */
/**
 * resize(el): Matn maydoni balandligini avtomatik ravishda
 * foydalanuvchi yozgan sari kattalashtiradi.
 */
function resize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 300) + 'px';
  syncEditorHighlight();
}

function syncEditorHighlight() {
  const inp = document.getElementById('inp');
  const overlay = document.getElementById('highlightOverlay');
  const gutter = document.getElementById('editorGutter');
  if (!inp || !overlay || !gutter) return;

  const text = inp.value;

  // Syntax highlight via highlight.js auto-detect
  if (text.trim()) {
    const result = hljs.highlightAuto(text);
    overlay.innerHTML = result.value;
  } else {
    overlay.innerHTML = '';
  }

  // Line numbers
  const lines = text.split('\n');
  const lineCount = lines.length;
  gutter.innerHTML = '';
  for (let i = 1; i <= lineCount; i++) {
    const div = document.createElement('div');
    div.className = 'gutter-line';
    div.textContent = i;
    gutter.appendChild(div);
  }
  // Always show at least one line
  if (lineCount === 0) {
    const div = document.createElement('div');
    div.className = 'gutter-line';
    div.textContent = '1';
    gutter.appendChild(div);
  }
}

/** Called by textarea onkeydown — submits on Enter (not Shift+Enter) */
/**
 * onKey(e): Enter tugmasi bosilganda (Shift+Enter bundan mustasno)
 * xabarni jo‘natadi.
 */
function onKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

/**
 * setWeb — toggles WEB SEARCH on/off.
 * KEY FIX: This now works independently of isThinking.
 * Toggling web search has NO effect on which AI model is used.
 */
/**
 * setWeb(): Internet qidiruvini yoqadi/o‘chiradi. U isThinking
 * bayrog‘iga ta’sir qilmaydi.
 */
function setWeb() {
  AppState.isWebSearch = !AppState.isWebSearch;
  UIController.updateWebBtn();
}

/** Opens/closes the mode dropdown */
/**
 * toggleDropdown(): Rejim tanlash menyusini ochadi yoki yopadi.
 */
function toggleDropdown() {
  UIController.els.modeDropdown.classList.toggle('open');
}

/** Sets FAST mode — uses smaller/faster AI model */
/**
 * setFast(): “Tez” rejimni yoqadi (kichik model ishlatiladi).
 */
function setFast() {
  AppState.isThinking = false;
  UIController.updateModeDropdown();
  UIController.closeDropdown();
}

/**
 * setThinking — enables THINKING mode.
 *
 * KEY FIX: This only changes AppState.isThinking (the model choice).
 * It does NOT automatically enable web search.
 * Web search is still controlled separately by setWeb().
 */
/**
 * setThinking(): “O‘ylash” rejimini yoqadi (katta model ishlatiladi).
 * Internet qidiruvi bundan mustaqil.
//  */
function setThinking() {
  AppState.isThinking = true;
  UIController.updateModeDropdown();
  UIController.closeDropdown();
}

/** Clears conversation — "New Chat" button */
/**
 * newChat(): Suhbatni tozalaydi va yangi bo‘sh muloqot boshlaydi.
 */
// newChat() — histore.js da aniqlanadi (ikki marta e'lon qilmaslik uchun olib tashlandi)

function copyMsg(btn) {
  const bubble = btn.closest('.msg-content').querySelector('.msg-bubble');
  navigator.clipboard.writeText(bubble.innerText);
  btn.style.opacity = '0.4';
  setTimeout(() => btn.style.opacity = '1', 1000);
}

// Foydalanuvchi xabarini nusxalash
function copyUserMsg(btn) {
  const bubble = btn.closest('.msg-content').querySelector('.msg-bubble');
  navigator.clipboard.writeText(bubble.innerText);
  btn.style.color = '#22c55e';
  btn.innerHTML = '<i class="ph ph-check"></i>';
  setTimeout(() => {
    btn.style.color = '';
    btn.innerHTML = '<i class="ph ph-copy-simple"></i>';
  }, 1500);
}

// Foydalanuvchi xabarini tahrirlash — inline, ChatGPT uslubida
function editUserMsg(btn) {
  const msgBlock = btn.closest('.msg-block.user-message');
  const msgIndex = parseInt(msgBlock.dataset.msgIndex, 10);
  const bubble = msgBlock.querySelector('.msg-bubble');
  const originalText = AppState.conversation[msgIndex]?.content || bubble.innerText;

  // Inline tahrirlash panelini qo'shamiz
  const msgContent = msgBlock.querySelector('.msg-content');
  msgContent.innerHTML = `
    <div class="edit-inline-wrap">
      <textarea class="edit-inline-textarea" rows="3">${escapeHtml(originalText)}</textarea>
      <div class="edit-inline-actions">
        <button class="edit-cancel-btn" onclick="cancelEditMsg(this, ${msgIndex})">Bekor qilish</button>
        <button class="edit-save-btn" onclick="submitEditedMsg(this, ${msgIndex})">Jo'natish</button>
      </div>
    </div>`;

  const ta = msgContent.querySelector('.edit-inline-textarea');
  ta.focus();
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  });
  // Enter — jo'natish, Shift+Enter — yangi qator
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitEditedMsg(msgContent.querySelector('.edit-save-btn'), msgIndex);
    }
    if (e.key === 'Escape') {
      cancelEditMsg(msgContent.querySelector('.edit-cancel-btn'), msgIndex);
    }
  });
}

// Tahrirlashni bekor qilish — asl xabarni qayta ko'rsatish
function cancelEditMsg(btn, msgIndex) {
  UIController.renderConversation();
}

// Tahrirlangan xabarni jo'natish — eski javobni o'chirib yangisini olish
async function submitEditedMsg(btn, msgIndex) {
  if (AppState.isBusy) return;
  const msgContent = btn.closest('.msg-content');
  const newText = msgContent.querySelector('.edit-inline-textarea')?.value?.trim();
  if (!newText) return;

  // Shu xabardan keyingi barcha suhbatni o'chiramiz (user msg + AI javob)
  AppState.conversation = AppState.conversation.slice(0, msgIndex);

  // Tahrirlangan xabarni input ga qo'yamiz va jo'natamiz
  UIController.els.inp.value = newText;
  UIController.renderConversation();
  await ChatController.sendMessage();
}

function likeMsg(btn) {
  const actions = btn.closest('.msg-actions');
  const dislike = actions.querySelector('[title="Dislike"]');
  const active = btn.dataset.active === 'true';
  btn.dataset.active = !active;
  btn.style.color = !active ? '#22c55e' : '';
  dislike.dataset.active = 'false';
  dislike.style.color = '';
}

function dislikeMsg(btn) {
  const actions = btn.closest('.msg-actions');
  const like = actions.querySelector('[title="Like"]');
  const active = btn.dataset.active === 'true';
  btn.dataset.active = !active;
  btn.style.color = !active ? '#ef4444' : '';
  like.dataset.active = 'false';
  like.style.color = '';
}
/**
 * handleFile — reads an attached text/csv file and appends its
 * content to the current textarea input, so the user can ask
 * questions about it in their next message.
 */
/**
 * handleFile(event): Fayl yuklanganda, uning matnini matn maydoniga
 * qo‘shadi (foydalanuvchi shu fayl haqida savol berishi uchun).
 */
function handleFile(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;

  files.forEach(file => {
    // Only process readable text-based files
    const textTypes = ['text/plain', 'text/csv', 'application/json'];
    if (!textTypes.some(t => file.type.includes(t)) && !file.name.endsWith('.txt') && !file.name.endsWith('.csv')) {
      UIController.els.inp.value += `\n[Attached: ${file.name} — binary file, summarise if needed]`;
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      const content = e.target.result.slice(0, 4000); // cap at ~4k chars
      UIController.els.inp.value +=
        `\n\n--- File: ${file.name} ---\n${content}\n--- End of file ---`;
      resize(UIController.els.inp);
    };
    reader.readAsText(file);
  });

  // Reset the file input so the same file can be re-selected
  event.target.value = '';
}

/** Opens the API settings modal */
/**
 * showSetup(): Sozlamalar oynasini ochadi (API kalitlarini kiritish
 * uchun).callTavily
 */
function showSetup() {
  // Bo'lim 1: Matn AI
  document.getElementById('groqKey').value      = AppState.apiKeys.groq;
  document.getElementById('deepseekKey').value  = AppState.apiKeys.deepseek;
  document.getElementById('geminiKey').value    = AppState.apiKeys.gemini;
  document.getElementById('openaiKey').value    = AppState.apiKeys.openai;
  // Bo'lim 2: STT
  document.getElementById('sttGroqKey').value   = AppState.apiKeys.sttGroq;
  document.getElementById('sttGeminiKey').value = AppState.apiKeys.sttGemini;
  document.getElementById('sttOpenaiKey').value = AppState.apiKeys.sttOpenai;
  // Bo'lim 3: TTS
  document.getElementById('ttsGeminiKey').value = AppState.apiKeys.ttsGemini;
  document.getElementById('ttsOpenaiKey').value  = AppState.apiKeys.ttsOpenai;
  document.getElementById('ttsElevenKey').value  = AppState.apiKeys.ttsEleven;
  document.getElementById('ttsUnrealKey').value  = AppState.apiKeys.ttsUnreal;
  document.getElementById('ttsAiKey').value       = AppState.apiKeys.ttsAi;
  // Web Search
  document.getElementById('exaKey').value       = AppState.apiKeys.exa;
  document.getElementById('tavilyKey').value    = AppState.apiKeys.tavily;
  document.getElementById('overlay').classList.remove('hidden');
}
/** Closes the settings modal without saving */
/**
 * closeSetup(): Sozlamalar oynasini yopadi, kiritilgan kalitlar
 * saqlanmaydi.
 */
function closeSetup() {
  document.getElementById('overlay').classList.add('hidden');
}

/** Saves API keys from the modal to AppState + localStorage */
/**
 * saveKeys(): Sozlamalardagi API kalitlarini AppState’ga va
 * localStorage’ga yozadi.
 */
function saveKeys() {
  // Bo'lim 1: Matn AI
  AppState.apiKeys.groq       = document.getElementById('groqKey').value.trim();
  AppState.apiKeys.deepseek   = document.getElementById('deepseekKey').value.trim();
  AppState.apiKeys.gemini     = document.getElementById('geminiKey').value.trim();
  AppState.apiKeys.openai     = document.getElementById('openaiKey').value.trim();
  // Bo'lim 2: STT
  AppState.apiKeys.sttGroq   = document.getElementById('sttGroqKey').value.trim();
  AppState.apiKeys.sttGemini  = document.getElementById('sttGeminiKey').value.trim();
  AppState.apiKeys.sttOpenai  = document.getElementById('sttOpenaiKey').value.trim();
  // Bo'lim 3: TTS
  AppState.apiKeys.ttsGemini  = document.getElementById('ttsGeminiKey').value.trim();
  AppState.apiKeys.ttsOpenai  = document.getElementById('ttsOpenaiKey').value.trim();
  AppState.apiKeys.ttsEleven  = document.getElementById('ttsElevenKey').value.trim();
  AppState.apiKeys.ttsUnreal  = document.getElementById('ttsUnrealKey').value.trim();
  AppState.apiKeys.ttsAi      = document.getElementById('ttsAiKey').value.trim();
  // Web Search
  AppState.apiKeys.exa        = document.getElementById('exaKey').value.trim();
  AppState.apiKeys.tavily     = document.getElementById('tavilyKey').value.trim();

  // localStorage ga saqlash
  localStorage.setItem('axis_groq',        AppState.apiKeys.groq);
  localStorage.setItem('axis_deepseek',    AppState.apiKeys.deepseek);
  localStorage.setItem('axis_gemini',      AppState.apiKeys.gemini);
  localStorage.setItem('axis_openai',      AppState.apiKeys.openai);
  localStorage.setItem('axis_stt_groq',   AppState.apiKeys.sttGroq);
  localStorage.setItem('axis_stt_gemini',  AppState.apiKeys.sttGemini);
  localStorage.setItem('axis_stt_openai',  AppState.apiKeys.sttOpenai);
  localStorage.setItem('axis_tts_gemini',  AppState.apiKeys.ttsGemini);
  localStorage.setItem('axis_tts_openai',  AppState.apiKeys.ttsOpenai);
  localStorage.setItem('axis_tts_eleven',  AppState.apiKeys.ttsEleven);
  localStorage.setItem('axis_tts_unreal', AppState.apiKeys.ttsUnreal);
  localStorage.setItem('axis_tts_ai',     AppState.apiKeys.ttsAi);
  localStorage.setItem('axis_exa',         AppState.apiKeys.exa);
  localStorage.setItem('axis_tavily',      AppState.apiKeys.tavily);

  closeSetup();
  UIController.renderConversation();
}

/** Exports current conversation to a PDF file using jsPDF */
/**
 * exportToPDF(): Suhbatni PDF fayl sifatida yuklab oladi.
 */
/** Copies conversation as plain text to the clipboard (for Google Docs paste) */
/**
 * exportForDocs(): Suhbatni oddiy matn shaklida almashish buferiga
 * nusxalaydi (Google Docs’ga qo‘yish uchun qulay).
 */
function exportForDocs() {
  if (!AppState.conversation.length) {
    alert('No conversation to export yet.');
    return;
  }

  const text = AppState.conversation
    .map(m => `${m.role === 'user' ? 'You' : 'Axis AI'} [${m.time || ''}]:\n${m.content}`)
    .join('\n\n─────────────────\n\n');

  navigator.clipboard.writeText(text)
    .then(() => alert('Conversation copied to clipboard! Paste into Google Docs.'))
    .catch(() => alert('Could not copy. Try a different browser.'));
}


/* ═══════════════════════════════════════════════════════════════
   7. INIT — runs once when the page loads
═══════════════════════════════════════════════════════════════ */
/**
 * ==============================================================
 * BU YERDA: init() – sahifa ochilganda bir marta ishga tushadi.
 * Markdown parserini sozlaydi, UI elementlarini tayyorlaydi,
 * API kalitlarini va suhbat tarixini tiklaydi.
 * ==============================================================
 */
function init() {
  // Configure marked (Markdown parser)
  marked.setOptions({ breaks: true, gfm: true });

  // Boot UIController (cache DOM refs)
  UIController.init();

  // Initialize editor gutter + highlight overlay
  syncEditorHighlight();

  // Sync editor overlay scroll with textarea scroll
  const inp = document.getElementById('inp');
  if (inp) {
    inp.addEventListener('scroll', function() {
      const overlay = document.querySelector('.editor-highlight');
      if (overlay) overlay.scrollTop = this.scrollTop;
    });
  }

  // Load API keys from localStorage
  // Bo'lim 1: Matn AI
  AppState.apiKeys.groq      = localStorage.getItem('axis_groq')       || '';
  AppState.apiKeys.deepseek  = localStorage.getItem('axis_deepseek')   || '';
  AppState.apiKeys.gemini    = localStorage.getItem('axis_gemini')     || '';
  AppState.apiKeys.openai    = localStorage.getItem('axis_openai')     || '';
  // Bo'lim 2: STT
  AppState.apiKeys.sttGroq   = localStorage.getItem('axis_stt_groq')   || '';
  AppState.apiKeys.sttGemini = localStorage.getItem('axis_stt_gemini') || '';
  AppState.apiKeys.sttOpenai = localStorage.getItem('axis_stt_openai') || '';
  // Bo'lim 3: TTS
  AppState.apiKeys.ttsGemini = localStorage.getItem('axis_tts_gemini') || '';
  AppState.apiKeys.ttsOpenai = localStorage.getItem('axis_tts_openai') || '';
  AppState.apiKeys.ttsEleven = localStorage.getItem('axis_tts_eleven')  || '';
  AppState.apiKeys.ttsUnreal = localStorage.getItem('axis_tts_unreal') || '';
  AppState.apiKeys.ttsAi     = localStorage.getItem('axis_tts_ai') || '';
  // Web Search
  AppState.apiKeys.exa       = localStorage.getItem('axis_exa')        || '';
  AppState.apiKeys.tavily    = localStorage.getItem('axis_tavily')     || '';

  // Restore chat history
  try {
    const saved = localStorage.getItem('axis_chat_history');
    if (saved) AppState.conversation = JSON.parse(saved);
  } catch (e) {
    AppState.conversation = [];
  }

  // Close mode dropdown when clicking anywhere else in the document
  document.addEventListener('click', e => {
    if (!e.target.closest('.mode-dropdown-wrap')) {
      UIController.closeDropdown();
    }
  });

  // If no AI key is configured, show a hint in the empty state
  UIController.renderConversation();
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const btn = document.querySelector('.sidebar-toggle-btn');
  sidebar.classList.toggle('collapsed');
  btn.classList.toggle('btn-collapsed', sidebar.classList.contains('collapsed'));
}

// Kick everything off
init();