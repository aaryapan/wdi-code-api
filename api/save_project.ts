export const config = { runtime: 'edge' };

import { randomUUID } from "node:crypto";

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await req.json().catch(() => null) as any;
  if (!body || !body.name || body.tech !== "react_ts") {
    return Response.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }

  const projectId = body.projectId || randomUUID();
  return Response.json({ ok: true, projectId });
}
