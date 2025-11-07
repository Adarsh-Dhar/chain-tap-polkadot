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
  const debugMode = req.headers.get("x-minthook-debug") === "true"

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
      select: { phalaEndpoint: true, tokensPerOrder: true, assetId: true },
    })
  } catch (error) {
    console.error("Database error:", error)
    return new Response("database_error", { status: 500 })
  }

  if (!contract) {
    return new Response("contract_not_found", { status: 404 })
  }

  const base = (contract.phalaEndpoint || "").trim().replace(/\/$/, "")
  const forwardToken = process.env.PHAT_FORWARD_TOKEN || ""
  const envFallback = (process.env.PHAT_ENDPOINT_URL || "").trim()

  type TargetSource = "contract" | "env" | "dev" | "mock"

  const forwardTargets: Array<{ url: string; source: TargetSource }> = []
  const appendTarget = (url: string, source: TargetSource) => {
    if (!url) return
    const normalized = url.replace(/\/$/, "")
    if (!forwardTargets.some((target) => target.url === normalized)) {
      forwardTargets.push({ url: normalized, source })
    }
  }
  const appendForwardVariants = (url: string, source: TargetSource) => {
    try {
      const parsed = new URL(url)
      const trimmedPath = parsed.pathname.replace(/\/$/, "")
      appendTarget(parsed.toString(), source)
      if (trimmedPath === "" || trimmedPath === "/") {
        const forwardUrl = new URL(parsed.toString())
        forwardUrl.pathname = "/forward-order"
        appendTarget(forwardUrl.toString(), source)
      } else if (!trimmedPath.endsWith("/forward-order")) {
        const forwardUrl = new URL(parsed.toString())
        forwardUrl.pathname = `${trimmedPath}/forward-order`
        appendTarget(forwardUrl.toString(), source)
      }
    } catch {
      if (!url.endsWith("/forward-order")) {
        appendTarget(url, source)
        appendTarget(`${url.replace(/\/$/, "")}/forward-order`, source)
      } else {
        appendTarget(url, source)
      }
    }
  }

  if (base) {
    appendForwardVariants(base, "contract")
  }

  if (envFallback) {
    appendForwardVariants(envFallback, "env")
  }

  if (process.env.NODE_ENV !== "production") {
    appendTarget("http://127.0.0.1:5000/forward-order", "dev")
    appendTarget("http://localhost:5000/forward-order", "dev")
  }

  if (!forwardTargets.length) {
    const message = "phat_forwarder_not_configured"
    console.warn("Phat forwarder URL missing", { contractId })
    if (debugMode) {
      return new Response(message, { status: 428 })
    }
    return new Response("ok")
  }

  const attempts: Array<{
    target: string
    source: TargetSource
    ok: boolean
    status?: number
    body?: string
    error?: string
  }> = []

  let forwarderStatus: {
    ok: boolean
    status?: number
    body?: string
    error?: string
    target?: string
  } | null = null

  for (const target of forwardTargets) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const forwardResponse = await fetch(target.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forward-token": forwardToken,
          "x-contract-id": String(contractId),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const responseBody = await forwardResponse.text().catch(() => "")
      forwarderStatus = {
        ok: forwardResponse.ok,
        status: forwardResponse.status,
        body: responseBody,
        target: target.url,
      }
      attempts.push({
        target: target.url,
        source: target.source,
        ok: forwardResponse.ok,
        status: forwardResponse.status,
        body: responseBody,
      })
      if (forwardResponse.ok) {
        console.info("Forwarder accepted order", {
          contractId,
          status: forwardResponse.status,
          target: target.url,
        })
        break
      } else {
        console.error("Forwarder responded with error", {
          contractId,
          status: forwardResponse.status,
          body: responseBody,
          target: target.url,
        })
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown forwarder error")
      console.error("Forwarder request failed", {
        contractId,
        error: err,
        target: target.url,
        source: target.source,
      })
      forwarderStatus = {
        ok: false,
        error: err.message,
        target: target.url,
      }
      attempts.push({
        target: target.url,
        source: target.source,
        ok: false,
        error: err.message,
      })
    }
  }

  if (!forwarderStatus?.ok) {
    const isDevMode = process.env.NODE_ENV !== "production"
    if (isDevMode) {
      const orderPayload = body as { id?: unknown; note?: string }
      const mockOrderId = orderPayload?.id ? String(orderPayload.id) : `mock-${Date.now()}`
      let mockWallet: string | null = null
      if (typeof orderPayload?.note === "string") {
        const match = orderPayload.note.match(/[A-Za-z0-9]{47,}/)
        if (match) {
          mockWallet = match[0]
        }
      }

      try {
        await prisma.orderReward.upsert({
          where: { contractId_orderId: { contractId: id, orderId: mockOrderId } },
          create: {
            contractId: id,
            orderId: mockOrderId,
            wallet: mockWallet,
            amount: contract?.tokensPerOrder != null ? String(contract.tokensPerOrder) : null,
            assetId: contract?.assetId ?? null,
            status: "mocked",
            error: null,
          },
          update: {
            wallet: mockWallet ?? undefined,
            amount: contract?.tokensPerOrder != null ? String(contract.tokensPerOrder) : undefined,
            assetId: contract?.assetId ?? undefined,
            status: "mocked",
            error: null,
          },
        })

        forwarderStatus = {
          ok: true,
          status: 200,
          body: "mock_forwarder_success",
          target: "mock://dev-fallback",
        }
        attempts.push({
          target: "mock://dev-fallback",
          source: "mock",
          ok: true,
          status: 200,
          body: "mock_forwarder_success",
        })
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Mock reward upsert failed")
        console.error("Mock reward creation failed", { contractId: id, error: err })
        attempts.push({
          target: "mock://dev-fallback",
          source: "mock",
          ok: false,
          error: err.message,
        })
      }
    }
  }

  if (debugMode) {
    if (!forwarderStatus?.ok) {
      const status = forwarderStatus?.status || 502
      return Response.json(
        {
          message: forwarderStatus?.body || forwarderStatus?.error || "forwarder_failed",
          attempts,
        },
        { status }
      )
    }
    return Response.json(
      {
        message: forwarderStatus.body || "ok",
        attempts,
      },
      { status: forwarderStatus.status || 200 }
    )
  }

  return new Response("ok")
}

