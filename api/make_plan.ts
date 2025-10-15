export const config = { runtime: 'edge' };

import OpenAI from "openai";

const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const { projectId, userRawPrompt } = await req.json() as {
    projectId?: string; userRawPrompt?: string;
  };

  if (!projectId || !userRawPrompt) {
    return Response.json({ error: "projectId and userRawPrompt required" }, { status: 400 });
  }

  const system = `You are the WDI PRE Planner.
Rewrite the user prompt strictly in-scope based on an agreed Scope of Work.
Return JSON ONLY with keys:
proposedPrompt, inScope[], outOfScope[], assumptions[], acceptanceCriteria[], questions[], steps[] (≤10 items with {id,title}).`;

  const user = `user_prompt:
${userRawPrompt}

WDI React standards apply: React 18 + TypeScript, Radix UI, Redux Toolkit + RTK Query, and Tailwind or styled-components. Produce ≤10 steps.`;

  const resp = await oai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  const data = JSON.parse(resp.choices[0]?.message?.content || "{}");
  const steps = Array.isArray(data.steps)
    ? data.steps.slice(0, 10).map((s: any, i: number) => ({ id: s?.id || `s${i+1}`, title: s?.title || `Step ${i+1}` }))
    : [];

  return Response.json({
    proposedPrompt: data.proposedPrompt ?? userRawPrompt,
    inScope: data.inScope ?? [],
    outOfScope: data.outOfScope ?? [],
    assumptions: data.assumptions ?? [],
    acceptanceCriteria: data.acceptanceCriteria ?? [],
    questions: data.questions ?? [],
    steps
  });
}
