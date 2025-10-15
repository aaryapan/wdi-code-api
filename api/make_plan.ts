import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const PLANNER_ASSISTANT_ID = process.env.PLANNER_ASSISTANT_ID!;

const oai = new OpenAI({ apiKey: OPENAI_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }
  if (!OPENAI_API_KEY || !PLANNER_ASSISTANT_ID) {
    return res.status(500).json({ error: 'Server not configured: missing OPENAI_API_KEY or PLANNER_ASSISTANT_ID' });
  }

  const body = coerceJson(req.body) as {
    projectId?: string;
    userRawPrompt?: string;
  };

  const { projectId, userRawPrompt } = body || {};
  if (!projectId || !userRawPrompt) {
    return res.status(400).json({ error: 'projectId and userRawPrompt required' });
  }

  try {
    // Create a fresh thread for this PRE call
    const thread = await oai.beta.threads.create();

    // Add the user's raw prompt as a message (keep it simple for MVP)
    await oai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content:
        [
          'You will produce ONLY JSON.',
          'Return keys exactly:',
          'proposedPrompt:string, inScope:string[], outOfScope:string[], assumptions:string[], acceptanceCriteria:string[], questions:string[], steps:{id:string,title:string}[] (≤10).',
          'Never generate code.',
          '',
          `RAW_PROMPT:\n${userRawPrompt}`
        ].join('\n')
    });

    // Run with the Planner Assistant
    const run = await oai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: PLANNER_ASSISTANT_ID
    });

    if (run.status !== 'completed') {
      return res.status(502).json({ error: `Planner run not completed: ${run.status}` });
    }

    // Read assistant response
    const msgs = await oai.beta.threads.messages.list(thread.id);
    const assistantMsg = msgs.data.find(m => m.role === 'assistant');
    const text = extractText(assistantMsg);

    const parsed = safeParseJson(text);

    // Normalize and clamp steps to ≤10
    const steps = Array.isArray(parsed?.steps)
      ? parsed.steps.slice(0, 10).map((s: any, i: number) => ({
          id: s?.id || `s${i + 1}`,
          title: s?.title || `Step ${i + 1}`
        }))
      : [];

    return res.status(200).json({
      proposedPrompt: parsed?.proposedPrompt ?? userRawPrompt,
      inScope: toArray(parsed?.inScope),
      outOfScope: toArray(parsed?.outOfScope),
      assumptions: toArray(parsed?.assumptions),
      acceptanceCriteria: toArray(parsed?.acceptanceCriteria),
      questions: toArray(parsed?.questions),
      steps
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Planner error' });
  }
}

// --- helpers ---
function coerceJson(input: any) {
  if (typeof input === 'string') {
    try { return JSON.parse(input); } catch { return {}; }
  }
  return input || {};
}

function extractText(msg: any): string {
  if (!msg?.content) return '';
  // Assistants API returns segments; we only need text for MVP
  const parts = msg.content
    .filter((c: any) => c.type === 'text' && c.text?.value)
    .map((c: any) => c.text.value);
  return parts.join('\n').trim();
}

function safeParseJson(s: string) {
  if (!s) return {};
  // Try plain JSON
  try { return JSON.parse(s); } catch { /* fallthrough */ }
  // Try to extract first ```json block
  const m = s.match(/```json\s*([\s\S]+?)\s*```/i);
  if (m) {
    try { return JSON.parse(m[1]); } catch { /* ignore */ }
  }
  return {};
}

function toArray(x: any): string[] {
  return Array.isArray(x) ? x.map(String) : [];
}
