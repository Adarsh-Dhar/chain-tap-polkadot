import { verifyShopifyHmac } from "@/lib/shopify"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ""
  if (!secret) {
    console.error("❌ [WEBHOOK] SHOPIFY_WEBHOOK_SECRET not configured")
    return new Response("server_misconfigured", { status: 500 })
  }

  const raw = Buffer.from(await req.arrayBuffer())
  const hmac = req.headers.get("x-shopify-hmac-sha256") || ""
  const topic = req.headers.get("x-shopify-topic") || ""

  console.log("📥 [WEBHOOK] Received webhook:", { topic, hasHmac: !!hmac })

  if (!verifyShopifyHmac(raw, hmac, secret)) {
    console.error("❌ [WEBHOOK] HMAC verification failed")
    return new Response("unauthorized", { status: 401 })
  }

  if (topic !== "orders/create") {
    console.log("ℹ️ [WEBHOOK] Ignoring non-orders/create topic:", topic)
    return new Response("accepted", { status: 202 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw.toString("utf8"))
    console.log("✅ [WEBHOOK] Order parsed:", {
      orderId: (body as any)?.id,
      email: (body as any)?.email,
      lineItemsCount: (body as any)?.line_items?.length || 0,
    })
  } catch {
    console.error("❌ [WEBHOOK] Failed to parse JSON")
    return new Response("bad_request", { status: 400 })
  }

  const phatUrl = process.env.PHAT_ENDPOINT_URL
  const forwardToken = process.env.PHAT_FORWARD_TOKEN || ""

  if (!phatUrl) {
    console.error("❌ [WEBHOOK] PHAT_ENDPOINT_URL not configured")
    return new Response("ok") // Return ok to Shopify so it doesn't retry
  }

  if (!forwardToken) {
    console.error("❌ [WEBHOOK] PHAT_FORWARD_TOKEN not configured")
  }

  console.log("🚀 [WEBHOOK] Forwarding to:", phatUrl)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // Increased to 30s for minting
    
    const response = await fetch(phatUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forward-token": forwardToken,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    
    clearTimeout(timeout)

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error")
      console.error("❌ [WEBHOOK] Forwarder returned error:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText.substring(0, 500),
      })
    } else {
      const responseText = await response.text().catch(() => "")
      console.log("✅ [WEBHOOK] Forwarder response:", {
        status: response.status,
        body: responseText.substring(0, 500),
      })
    }
  } catch (error) {
    console.error("❌ [WEBHOOK] Error forwarding to forwarder:", {
      error: error instanceof Error ? error.message : String(error),
      url: phatUrl,
    })
    // Swallow errors to not cause Shopify retries due to downstream issues
  }

  return new Response("ok")
}


