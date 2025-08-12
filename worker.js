// worker.js - The AI analysis and all heavy logic runs here.

import * as webllm from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm/+esm';

let engine;
let SCRIPT_CONFIG;
let smoothedScore = 0;
let lastAnalyzedText = '';

// --- Logic Functions (now live inside the worker) ---
function levenshtein(a,b){const m=Array(b.length+1).fill(null).map(()=>Array(a.length+1).fill(null));for(let i=0;i<=a.length;i+=1){m[0][i]=i;}for(let j=0;j<=b.length;j+=1){m[j][0]=j;}for(let j=1;j<=b.length;j+=1){for(let i=1;i<=a.length;i+=1){const ind=a[i-1]===b[j-1]?0:1;m[j][i]=Math.min(m[j][i-1]+1,m[j-1][i]+1,m[j-1][i-1]+ind);}}return m[b.length][a.length];}
function extractJSON(raw) {if(!raw)return null;const m=raw.match(/\{[\s\S]*\}/);if(!m)return null;try{return JSON.parse(m[0]);}catch(e){return null;}}

async function handleAnalysis(event) {
    if (event.data.type !== 'ANALYZE') return;
    
    const normalizedText = event.data.text.split('\n').filter(line => line.trim() !== '').join(' ').replace(/\s+/g, ' ').trim();
    if (normalizedText === lastAnalyzedText || !normalizedText) {
        self.postMessage({ type: 'NO_OP' }); // Tell main thread we did nothing
        return;
    }

    try {
        const getAnalysis = async () => { /* ... */ };
        getAnalysis = async () => {
            const reply = await engine.chat.completions.create({
                messages: [{ role: 'system', content: SCRIPT_CONFIG.systemPrompt }, { role: 'user', content: normalizedText }],
                temperature: 0.1, top_p: 0.5, max_tokens: 80,
            });
            const rawResponse = reply.choices[0]?.message?.content || "";
            return extractJSON(rawResponse);
        };
        
        let result = await getAnalysis();
        if (!result) { result = await getAnalysis(); }

        if (result && typeof result.reactive_score === 'number') {
            const distance = levenshtein(lastAnalyzedText, normalizedText);
            const isLargeChange = distance > SCRIPT_CONFIG.LARGE_CHANGE_THRESHOLD || lastAnalyzedText === '';
            let dynamicAlpha = isLargeChange ? 1.0 : SCRIPT_CONFIG.EMA_ALPHA_MIN + (SCRIPT_CONFIG.EMA_ALPHA_MAX - SCRIPT_CONFIG.EMA_ALPHA_MIN) * Math.min(distance / SCRIPT_CONFIG.LARGE_CHANGE_THRESHOLD, 1.0);
            
            lastAnalyzedText = normalizedText;
            const currentScore = Math.max(0, Math.min(1, result.reactive_score));
            smoothedScore = (dynamicAlpha * currentScore) + (1 - dynamicAlpha) * smoothedScore;

            self.postMessage({ type: 'RESULT', payload: {
                smoothedScore: smoothedScore,
                triggers: result.triggers || [],
                isLargeChange: isLargeChange
            }});
        } else {
            self.postMessage({ type: 'ERROR', text: 'Analysis incomplete. Try rephrasing.' });
        }
    } catch (e) {
        self.postMessage({ type: 'ERROR', text: 'An error occurred during analysis.' });
    }
}

// Initial message handler for setup.
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
        self.onmessage = handleAnalysis;
    }
};