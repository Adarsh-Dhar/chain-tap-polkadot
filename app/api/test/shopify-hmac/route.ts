import crypto from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ""
  if (!secret) return new Response("server_misconfigured", { status: 500 })

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return new Response("bad_request", { status: 400 })
  }

  const bodyString = typeof payload === "string" ? payload : JSON.stringify(payload)
  const hmac = crypto.createHmac("sha256", secret).update(bodyString).digest("base64")

  return Response.json({ hmac })
}


