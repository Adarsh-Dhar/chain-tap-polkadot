import { verifyShopifyHmac } from "@/lib/shopify"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  req: Request,
  { params }: { params: Promise<{ contractId: string }> }
) {
  const { contractId } = await params
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET || ""
  
  if (!secret) {
    return new Response("server_misconfigured", { status: 500 })
  }

  const raw = Buffer.from(await req.arrayBuffer())
  const hmac = req.headers.get("x-shopify-hmac-sha256") || ""
  const topic = req.headers.get("x-shopify-topic") || ""

  if (!verifyShopifyHmac(raw, hmac, secret)) {
    return new Response("unauthorized", { status: 401 })
  }

  if (topic !== "orders/create") {
    return new Response("accepted", { status: 202 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw.toString("utf8"))
  } catch {
    return new Response("bad_request", { status: 400 })
  }

  // Parse contract ID and fetch Phala endpoint from database
  const id = parseInt(contractId, 10)
  if (isNaN(id)) {
    return new Response("invalid_contract_id", { status: 400 })
  }

  let contract
  try {
    contract = await prisma.contract.findUnique({
      where: { id },
      select: { phalaEndpoint: true },
    })
  } catch (error) {
    console.error("Database error:", error)
    return new Response("database_error", { status: 500 })
  }

  if (!contract) {
    return new Response("contract_not_found", { status: 404 })
  }

  const phatUrl = contract.phalaEndpoint
  const forwardToken = process.env.PHAT_FORWARD_TOKEN || ""

  if (phatUrl) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      await fetch(phatUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forward-token": forwardToken,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeout)
    } catch {
      // Swallow errors to not cause Shopify retries due to downstream issues
    }
  }

  return new Response("ok")
}

