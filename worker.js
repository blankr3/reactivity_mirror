// worker.js - The AI analysis runs here in the background.

// Use a top-level import. This ensures the library is loaded before any other code runs, preventing race conditions.
import * as webllm from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm';

let engine;
let SCRIPT_CONFIG;

// This is the message handler for analysis requests AFTER initialization.
async function handleAnalysis(event) {
  // Check if the message is for analysis. If not, ignore it.
  if (event.data.type !== 'ANALYZE') return;
  const text = event.data.text;
  
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

// This is the initial message handler for setup.
self.onmessage = async (event) => {
  if (event.data.type === 'INITIALIZE') {
    SCRIPT_CONFIG = event.data.config;
    
    self.postMessage({ type: 'STATUS', text: 'Loading AI model...' });
    
    engine = await webllm.CreateMLCEngine(SCRIPT_CONFIG.model, {
      initProgressCallback: (info) => {
        if (info.total) {
            const percentage = Math.round((info.loaded / info.total) * 100);
            self.postMessage({ type: 'DOWNLOAD_PROGRESS', text: info.text, percentage: percentage });
        } else {
            self.postMessage({ type: 'STATUS', text: info.text });
        }
      }
    });

    self.postMessage({ type: 'STATUS', text: 'Warming up engine...' });
    await engine.chat.completions.create({
        messages: [{ role: 'system', content: SCRIPT_CONFIG.systemPrompt }, { role: 'user', content: "Test." }],
        temperature: 0.1, max_tokens: 10,
    });

    self.postMessage({ type: 'READY' });
    // Once initialization is done, switch to the analysis handler for all future messages.
    self.onmessage = handleAnalysis;
  }
};