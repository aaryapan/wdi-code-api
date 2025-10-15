import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  const body = coerceJson(req.body);

  const name = body?.name;
  const tech = body?.tech;
  // files may be URLs or opaque handles from your UI; stored later if you choose
  const files = body?.files;

  if (!name || tech !== 'react_ts') {
    return res.status(400).json({ ok: false, error: 'Missing fields (name, tech=react_ts required)' });
  }

  // For MVP: just mint and return a projectId
  const projectId = body?.projectId || randomUUID();

  // (Optional later: upload files to storage and/or attach to Assistants vector stores)

  return res.status(200).json({ ok: true, projectId });
}

// --- helpers ---
function coerceJson(input: any) {
  if (typeof input === 'string') {
    try { return JSON.parse(input); } catch { return {}; }
  }
  return input || {};
}
