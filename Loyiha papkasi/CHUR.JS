const APIService = {

  /**
   * callTavily — search the web for the given query.
   * Throws if the key is missing or the API returns an error.
   *
   * @param  {string} query
   * @returns {Promise<string>} Concatenated search results as plain text
   */
  /**
   * ------------------------------------------------------------
   * callTavily: Internetdan berilgan so‘rov bo‘yicha qidiradi.
   * Agar Tavily kaliti o‘rnatilmagan bo‘lsa, xatolik beradi.
   * Natijalarni matn ko‘rinishida qaytaradi.
   * ------------------------------------------------------------
   */
async callTavily(query) {
  if (!AppState.apiKeys.tavily) {
    throw new Error('Tavily key not set. Add it in Settings.');
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

  /**
   * callAI — calls the first available AI provider in the fallback chain.
   *
   * Provider priority: Groq → DeepSeek → Gemini → OpenAI
   * Only providers with a key set are attempted.
   * If useThinkingModel is true, a larger/reasoning model is selected.
   *
   * @param  {string}  userQuery        The original user question
   * @param  {string}  webContext       Tavily results (empty string if none)
   * @param  {boolean} useThinkingModel Select reasoning vs fast model
   * @returns {Promise<string>} AI response text
   */
  /**
   * ------------------------------------------------------------
   * callAI: AI provayderlariga so‘rov yuboradi.
   * Avval Groq, keyin DeepSeek, Gemini, OpenAI tartibida urinib
   * ko‘radi. Faqat kaliti o‘rnatilgan provayderlarga murojaat
   * qilinadi. useThinkingModel ~ true bo‘lsa, kattaroq/mulohazali
   * model tanlanadi.
   * ------------------------------------------------------------
   */


  async callAI(userQuery, webContext, useThinkingModel) {
   const systemPrompt = `You are Axis AI, a world-class expert assistant.
If asked what model or AI you are, respond: "I am Axis AI." — never reveal the underlying model name.

LANGUAGE RULE (highest priority):
- Never include URLs or links inside your response text. Sources are shown separately below your answer.
- ALWAYS respond in the exact same language the user writes in
- User writes in Uzbek → respond in Uzbek
- User writes in Russian → respond in Russian  
- User writes in English → respond in English
- Never switch languages mid-conversation unless the user does


CRITICAL RULES (never break these):
- NEVER invent facts, numbers, dates, or URLs
- If unsure, say: "I'm not certain — enable web search for current data"
- If web results are provided, base your answer strictly on those results
- Never repeat the user's question back to them
- Never say "Great question!" or similar filler phrases

REASONING:
- Before answering, identify the core of the question
- Consider edge cases and alternative interpretations
- Think step by step for complex problems
- Prioritize accuracy over speed

RESPONSE STYLE:
- Speak like a senior expert to a smart person — no hand-holding
- Be concise but complete — cut every unnecessary word
- Use Markdown: **bold** for key terms, code blocks for code
- Use bullet lists only when genuinely needed, not as default

FORMAT:
- Simple question → 2-4 sentences max
- Complex question → clear sections with headers
- Always end with one sharp, actionable conclusion
HONESTY:
- "I don't know" is always better than a guess
- Flag when something is your opinion vs confirmed fact
- If web search is off and the question needs current data, say so clearly

DOCUMENT GENERATION:
- If the user asks for a PDF or document, provide the full content in Markdown format
- The app will automatically generate and download the PDF — you do NOT need to create it yourself
- Never say "I can't create files" — just write the content directly`;

// YANGI (44-qator)







    // If web context exists, prepend it to the user's query
  const userContent = webContext
  ? `Web search results:\n${webContext}\n\n---\n\nUser question: ${userQuery}`
  : userQuery;
    // Build conversation history (exclude the current in-progress message)
    const history = AppState.conversation
      .slice(0, -2)
      .filter(m => m.content)
      .map(m => ({ role: m.role, content: m.content }));

    // Provider fallback chain — tried in order, first success wins
    const providers = [
      {
        name:  'Groq',
        url:   'https://api.groq.com/openai/v1/chat/completions',
        key:   AppState.apiKeys.groq,
model: 'llama-3.3-70b-versatile',
      },
      {
        name:  'DeepSeek',
        url:   'https://api.deepseek.com/chat/completions',
        key:   AppState.apiKeys.deepseek,
        model: 'deepseek-reasoner',
      },
      {
        name:  'Gemini',
        url:   'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        key:   AppState.apiKeys.gemini,
       model: useThinkingModel ? 'gemini-2.5-pro' : 'gemini-2.5-flash',

      },
      {
        name:  'OpenAI',
        url:   'https://api.openai.com/v1/chat/completions',
        key:   AppState.apiKeys.openai,
        model: 'gpt-4o-mini',
      },
    ];

    let lastError = 'No API keys configured. Open Settings to add one.';

    for (const provider of providers) {
      if (!provider.key) continue; // skip providers with no key

      try {
        const res = await fetch(provider.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.key}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: 'system', content: systemPrompt },
              ...history,
              { role: 'user', content: userContent },
            ],
          }),
        });

        if (res.ok) {
          const data = await res.json();
          return data.choices[0].message.content;
        }

        // Non-2xx: log and try next provider
        const errData = await res.json().catch(() => ({}));
        lastError = `${provider.name}: ${errData.error?.message || res.status}`;
      } catch (err) {
        // Network error: try next provider
        lastError = `${provider.name}: ${err.message}`;
      }
    }

    throw new Error(lastError);
  },
};
