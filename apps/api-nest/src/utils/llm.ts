import * as fs from 'fs';
import * as path from 'path';

type TutorRequest = {
  content: string;
  cfg: any;
  level?: string;
  focus?: string[];
  profile?: Record<string, any> | null;
};

export type TutorFeedback = {
  summary: string;
  issues: string;
  rewrite: string;
};

type GradeResp = { ok: boolean; provider: string; model?: string; latency_ms?: number; feedback?: TutorFeedback };

function loadLegacyPrompt(): string | null {
  const p = path.join(process.cwd(), 'data', 'config', 'llm-prompt.txt');
  try { return fs.readFileSync(p, 'utf-8'); } catch { return null; }
}

function buildCorePrompt({ content, level, focus, profile }: TutorRequest) {
  const focusList = (focus && focus.length > 0 ? focus : ['grammar', 'vocabulary', 'logic', 'style']).join(', ');
  const profileJson = profile ? JSON.stringify(profile).slice(0, 1000) : '{}';
  const legacy = loadLegacyPrompt();
  if (legacy) return legacy.replace(/\{essay\}/g, content).replace(/\{focus\}/g, focusList).replace(/\{profile\}/g, profileJson);
  return `You are an English writing tutor for CEFR ${level || 'B2'} learners.
Analyse the essay, praise the learner, and gently highlight only real mistakes (grammar/spelling/logic). For other aspects, provide encouragement instead of criticism.
Return ONLY valid JSON with fields: summary (overall feedback and positive encouragement plus essential suggestions), issues (only list concrete mistakes that must be fixed, each with friendly explanation), rewrite (a revised paragraph or email learners can reference).
Use Simplified Chinese for all text values except the rewrite, keep tone warm and supportive.
Essay:\n${content}\n\nFocus dimensions:\n${focusList}\n\nLearner profile:\n${profileJson}`;
}

function mergeFeedback(raw: any): TutorFeedback {
  return {
    summary: formatSummary(raw?.summary ?? raw?.overall ?? raw?.feedback ?? raw),
    issues: formatIssues(raw?.issues ?? raw?.problems ?? raw?.diagnosis ?? ''),
    rewrite: formatRewrite(raw?.rewrite ?? raw?.model_answer ?? raw?.revision ?? raw?.improved_text ?? ''),
  };
}

export async function gradeEssayLLM(req: TutorRequest): Promise<GradeResp> {
  const { content, cfg } = req;
  const provider = String(cfg?.provider || 'openai').toLowerCase();
  const pcfg = cfg?.providers?.[provider] || {};
  const started = Date.now();
  const fail = () => ({ ok:false, provider, model: pcfg.model, latency_ms: Date.now()-started });
  const corePrompt = buildCorePrompt(req);
  try {
    const controller = new AbortController();
    const timeout = Number(pcfg.timeout || 8000);
    const timer = setTimeout(()=>controller.abort(), timeout);
    let resp: any;
    if (provider === 'openai' || provider === 'deepseek') {
      const base = provider==='openai' ? (pcfg.base || 'https://api.openai.com/v1') : (pcfg.base || 'https://api.deepseek.com');
      const url = `${base}/chat/completions`;
      const headers: any = { 'Content-Type':'application/json', 'Authorization': `Bearer ${pcfg.apiKey||''}` };
      const model = pcfg.model || (provider==='openai' ? 'gpt-4o-mini' : 'deepseek-chat');
      const body = {
        model,
        temperature: pcfg.temperature ?? 0,
        max_tokens: pcfg.maxTokens ?? 900,
        messages: [
          { role:'system', content:'You are an English writing tutor. Always return valid JSON only, and respond in Simplified Chinese.' },
          { role:'user', content: corePrompt }
        ]
      };
      const r = await fetch(url, { method:'POST', headers, body: JSON.stringify(body), signal: controller.signal } as any);
      clearTimeout(timer);
      const j: any = await r.json();
      const txt = j?.choices?.[0]?.message?.content || '{}';
      resp = JSON.parse(safeJSON(txt));
      return { ok:true, provider, model, latency_ms: Date.now()-started, feedback: mergeFeedback(resp) };
    }
    if (provider === 'gemini') {
      const key = pcfg.apiKey || '';
      const model = pcfg.model || 'gemini-1.5-pro-latest';
      const base = pcfg.base || 'https://generativelanguage.googleapis.com';
      const url = `${base}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const body = { contents: [{ parts: [{ text: corePrompt }] }], generationConfig: { temperature: pcfg.temperature ?? 0, maxOutputTokens: pcfg.maxTokens ?? 900 } };
      const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body), signal: controller.signal } as any);
      clearTimeout(timer);
      const j: any = await r.json();
      const txt = j?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      resp = JSON.parse(safeJSON(txt));
      return { ok:true, provider, model, latency_ms: Date.now()-started, feedback: mergeFeedback(resp) };
    }
    if (provider === 'ollama') {
      const base = pcfg.base || 'http://localhost:11434';
      const model = pcfg.model || 'llama3:instruct';
      const url = `${base}/api/generate`;
      const body = { model, prompt: `${corePrompt}\nRemember: output JSON with keys summary, issues, rewrite, and respond in Simplified Chinese.`, format:'json', stream: false, options:{ temperature: pcfg.temperature ?? 0 } };
      const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body), signal: controller.signal } as any);
      clearTimeout(timer);
      const j: any = await r.json();
      resp = typeof j === 'string' ? JSON.parse(safeJSON(j)) : (j && j.response ? JSON.parse(safeJSON(j.response)) : j);
      return { ok:true, provider, model, latency_ms: Date.now()-started, feedback: mergeFeedback(resp) };
    }
    return fail();
  } catch {
    return { ok:false, provider, model: (cfg?.providers?.[provider]?.model)||'', latency_ms: Date.now()-started };
  }
}

function safeJSON(s: string){
  try { return s.trim().replace(/^```json\s*|```$/g,''); } catch { return '{}'; }
}

function formatSummary(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((v) => formatSummary(v)).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    const lines: string[] = [];
    if (value.overall) lines.push(String(value.overall));
    if (value.tone) lines.push(`语气建议：${String(value.tone)}`);
    const suggestions = value.next_steps || value.suggestions || value.actions;
    if (Array.isArray(suggestions) && suggestions.length > 0) {
      lines.push('改进建议:');
      suggestions.forEach((s: any) => {
        const text = formatSummary(s);
        if (text) lines.push(`- ${text}`);
      });
    }
    return lines.join('\n');
  }
  return String(value).trim();
}

function formatIssues(value: any): string {
  if (!value) return '';
  const items: string[] = [];
  const pushItem = (obj: any) => {
    if (!obj) return;
    if (typeof obj === 'string') { items.push(obj.trim()); return; }
    if (Array.isArray(obj)) { obj.forEach(pushItem); return; }
    if (typeof obj === 'object') {
      const lines: string[] = [];
      if (obj.dimension || obj.type) lines.push(`[${obj.dimension || obj.type}] ${obj.issue || obj.title || ''}`.trim());
      else if (obj.issue) lines.push(String(obj.issue));
      if (obj.explanation) lines.push(String(obj.explanation));
      if (obj.suggestion) lines.push(`建议：${String(obj.suggestion)}`);
      if (obj.example || obj.sample) lines.push(`示例：${String(obj.example || obj.sample)}`);
      const text = lines.join('\n').trim();
      if (text) items.push(text);
      return;
    }
    items.push(String(obj));
  };

  if (typeof value === 'string') {
    const lines = value.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.every((line) => line.startsWith('{') && line.endsWith('}'))) {
      lines.forEach((line) => {
        try { pushItem(JSON.parse(line)); } catch { items.push(line); }
      });
    } else {
      items.push(lines.join('\n'));
    }
  } else {
    pushItem(value);
  }

  const text = items.filter(Boolean).join('\n\n');
  return text || '目前没有发现需要特别修改的语法或逻辑问题，继续加油！';
}

function formatRewrite(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map((v) => formatRewrite(v)).filter(Boolean).join('\n');
  if (typeof value === 'object') {
    if (value.text) return formatRewrite(value.text);
    if (value.paragraph) return formatRewrite(value.paragraph);
    return Object.values(value).map(formatRewrite).filter(Boolean).join('\n');
  }
  return String(value).trim();
}
