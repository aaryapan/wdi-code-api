import OpenAI from "openai";
import AdmZip from "adm-zip";

const GUARD = "Ok WDI Code Now";
const MAX_LINES = 600;
const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const body = await req.json() as {
    projectId?: string;
    stepId?: string;
    guardWord?: string;
    proposedPrompt?: string;
    currentStepTitle?: string;
  };

  if (!body?.projectId || !body?.stepId) {
    return Response.json({ status: "failed", error: "projectId and stepId required" }, { status: 400 });
  }
  if (body.guardWord !== GUARD) {
    return Response.json({ status: "failed", error: "Guard word mismatch" }, { status: 400 });
  }

  const system = `You are the WDI Code Generator for React 18 + TypeScript.
Write ONLY the requested step. Use Radix UI, Redux Toolkit + RTK Query, and Tailwind (or styled-components if specified).
Add inline TypeScript docs, Jest + React Testing Library tests, and an edge-case list.
Hard limit: ${MAX_LINES} lines across ALL files.
If more is needed, STOP and return: {"status":"continue","note":"...","files":[]}
Return JSON ONLY: {"status":"ok|continue","files":[{"path":"src/...","contents":"..."}],"note":"optional"}.`;

  const user = `proposed_prompt:
${body.proposedPrompt ?? "(provided earlier)"}

current_step:
${body.currentStepTitle ?? body.stepId}
`;

  const resp = await oai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ]
  });

  const out = JSON.parse(resp.choices[0]?.message?.content || "{}");
  const files = Array.isArray(out.files) ? out.files : [];

  // Count lines to enforce cap
  const totalLines = files.reduce((n: number, f: any) => n + String(f?.contents || "").split("\n").length, 0);

  if (out.status === "continue" || totalLines > MAX_LINES) {
    return Response.json({
      status: "continue",
      note: out.note ?? "This step exceeds the line limit; continuing in N+1.",
      addedStep: { id: `${body.stepId}-nplus1`, title: `Continue ${body.stepId} (N+1)` }
    });
  }

  // Package ZIP as a data URL (MVP)
  const zip = new AdmZip();
  for (const f of files) {
    const p = String(f.path || "").replace(/^\/+/, "");
    zip.addFile(p, Buffer.from(String(f.contents || ""), "utf8"));
  }
  const zipDataUrl = `data:application/zip;base64,${zip.toBuffer().toString("base64")}`;

  return Response.json({
    status: "passed",
    zipUrl: zipDataUrl,
    githubPrUrl: null, // fill later when GitHub integration is added
    validatorSummary: "CI/lint/tests to be run on PR in GitHub."
  });
}
