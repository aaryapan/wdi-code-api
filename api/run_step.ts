import type { VercelRequest, VercelResponse } from '@vercel/node';
import OpenAI from 'openai';
import AdmZip from 'adm-zip';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const BUILDER_ASSISTANT_ID = process.env.BUILDER_ASSISTANT_ID!;
const GUARD_WORD = process.env.GUARD_WORD || 'Ok WDI Code Now';
const MAX_LINES = 600;

const oai = new OpenAI({ apiKey: OPENAI_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }
  if (!OPENAI_API_KEY || !BUILDER_ASSISTANT_ID) {
    return res.status(500).json({ error: 'Server not configured: missing OPENAI_API_KEY or BUILDER_ASSISTANT_ID' });
  }

  const body = coerceJson(req.body) as {
    projectId?: string;
    stepId?: string;
    guardWord?: string;
    proposedPrompt?: string;
    currentStepTitle?: string;
  };

  const { projectId, stepId, guardWord, proposedPrompt, currentStepTitle } = body || {};

  if (!projectId || !stepId) {
    return res.status(400).json({ status: 'failed', error: 'projectId and stepId required' });
  }
  if (guardWord !== GUARD_WORD) {
    return res.status(400).json({ status: 'failed', error: 'Guard word mismatch' });
  }

  try {
    const thread = await oai.beta.threads.create();

    // Provide minimal context; the Assistant holds the rules.
    await oai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: [
        'Return ONLY JSON in this shape:',
        '{ "status":"ok|continue", "files":[{"path":"src/...","contents":"..."}], "note":"optional" }',
        `Proposed Prompt:\n${proposedPrompt ?? '(provided earlier to the assistant)'}`,
        `Current Step:\n${currentStepTitle ?? stepId}`
      ].join('\n\n')
    });

    const run = await oai.beta.threads.runs.createAndPoll(thread.id, {
      assistant_id: BUILDER_ASSISTANT_ID
    });

    if (run.status !== 'completed') {
      return res.status(502).json({ status: 'failed', error: `Builder run not completed: ${run.status}` });
    }

    const msgs = await oai.beta.threads.messages.list(thread.id);
    const assistantMsg = msgs.data.find(m => m.role === 'assistant');
    const text = extractText(assistantMsg);
    const out = safeParseJson(text);

    if (out?.status === 'continue') {
      return res.status(200).json({
        status: 'continue',
        note: out?.note || 'This step exceeds the line limit; continuing in N+1.',
        addedStep: { id: `${stepId}-nplus1`, title: `Continue ${stepId} (N+1)` }
      });
    }

    const files: Array<{ path: string; contents: string }> = Array.isArray(out?.files) ? out.files : [];
    // Enforce line cap
    const totalLines = files.reduce((n, f) => n + String(f?.contents || '').split('\n').length, 0);
    if (totalLines > MAX_LINES) {
      return res.status(200).json({
        status: 'continue',
        note: `Line cap exceeded (${totalLines} > ${MAX_LINES}); continuing in N+1.`,
        addedStep: { id: `${stepId}-nplus1`, title: `Continue ${stepId} (N+1)` }
      });
    }

    // Build a ZIP (data URL for MVP)
    const zip = new AdmZip();
    for (const f of files) {
      if (!f?.path) continue;
      const cleanPath = String(f.path).replace(/^\/+/, '');
      zip.addFile(cleanPath, Buffer.from(String(f.contents || ''), 'utf8'));
    }
    const zipDataUrl = `data:application/zip;base64,${zip.toBuffer().toString('base64')}`;

    return res.status(200).json({
      status: 'passed',
      zipUrl: zipDataUrl,
      githubPrUrl: null,
      validatorSummary: 'Standards checks should run in CI on PR (optional).'
    });
  } catch (err: any) {
    return res.status(500).json({ status: 'failed', error: err?.message || 'Builder error' });
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
  const parts = msg.content
    .filter((c: any) => c.type === 'text' && c.text?.value)
    .map((c: any) => c.text.value);
  return parts.join('\n').trim();
}

function safeParseJson(s: string) {
  if (!s) return {};
  try { return JSON.parse(s); } catch { /* fallthrough */ }
  const m = s.match(/```json\s*([\s\S]+?)\s*```/i);
  if (m) {
    try { return JSON.parse(m[1]); } catch { /* ignore */ }
  }
  return {};
}
