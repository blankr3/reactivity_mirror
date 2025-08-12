let engine;
let SCRIPT_CONFIG;

import('https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm')
  .then(webllm => {
    self.onmessage = async (event) => {
      if (event.data.type === 'INITIALIZE') {
        SCRIPT_CONFIG = event.data.config;
        
        self.postMessage({ type: 'STATUS', text: 'Loading model...' });
        engine = await webllm.CreateMLCEngine(SCRIPT_CONFIG.model, {
          initProgressCallback: (info) => {
            const progressText = info.text ? info.text : "Loading...";
            const percent = info.total ? `(${Math.round((info.loaded / info.total) * 100)}%)` : '';
            self.postMessage({ type: 'STATUS', text: `${progressText} ${percent}`});
          }
        });

        self.postMessage({ type: 'STATUS', text: 'Warming up engine...' });
        await engine.chat.completions.create({
            messages: [{ role: 'system', content: SCRIPT_CONFIG.systemPrompt }, { role: 'user', content: "Test." }],
            temperature: 0.1, max_tokens: 10,
        });

        self.postMessage({ type: 'READY' });
        self.onmessage = handleAnalysis;
      }
    };
  });

async function handleAnalysis(event) {
  const text = event.data;
  try {
    const getAnalysis = async () => {
      const reply = await engine.chat.completions.create({
        messages: [{ role: 'system', content: SCRIPT_CONFIG.systemPrompt }, { role: 'user', content: text }],
        temperature: 0.1, top_p: 0.5, max_tokens: 80,
      });
      const rawResponse = reply.choices[0]?.message?.content || "";
      const match = rawResponse.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try { return JSON.parse(match[0]); } catch (e) { return null; }
    };
    
    let result = await getAnalysis();
    if (!result) { result = await getAnalysis(); }

    if (result && typeof result.reactive_score === 'number') {
      self.postMessage({ type: 'RESULT', payload: result });
    } else {
      self.postMessage({ type: 'ERROR', text: 'Analysis incomplete. Try rephrasing.' });
    }
  } catch (e) {
    self.postMessage({ type: 'ERROR', text: 'An error occurred during analysis.' });
  }
}