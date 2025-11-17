import { verifyShopifyHmac } from "@/lib/shopify"
import { prisma } from "@/lib/prisma"
import { sanitizeShop } from "@/lib/shopify-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Get default contract ID (use first contract or default to 1)
 */
async function getDefaultContractId(): Promise<number> {
  try {
    const contract = await prisma.contract.findFirst({
      orderBy: { id: "asc" },
    })
    return contract?.id || 1
  } catch (error) {
    console.error("❌ [WEBHOOK] Error getting default contract:", error)
    return 1
  }
}

/**
 * Look up Contract by shop domain, fallback to default
 */
async function getContractByShop(shop: string | null): Promise<number> {
  // For now, use default contract since Contract model doesn't have shop field
  // TODO: Add shop field to Contract model if needed for multi-shop support
  return getDefaultContractId()
}

/**
 * Extract wallet address from order metafields and attributes
 * Prioritizes metafields (hodlers_hedge.wallet_address), then falls back to attributes
 */
function extractWalletAddress(payload: any): string | null {
  // Debug: Log what we're looking for
  console.log("🔍 [WEBHOOK] Searching for wallet address in order payload...")

  // 1. PRIORITY: Check metafields first (hodlers_hedge.wallet_address)
  const metafields = payload.metafields || []
  console.log(`📦 [WEBHOOK] metafields count: ${metafields.length}`)
  if (metafields.length > 0) {
    console.log(
      `📦 [WEBHOOK] metafields:`,
      JSON.stringify(metafields, null, 2)
    )
  }

  const walletMetafield = metafields.find(
    (m: any) =>
      m.namespace === "hodlers_hedge" && m.key === "wallet_address"
  )
  if (walletMetafield?.value) {
    console.log(
      `✅ [WEBHOOK] Found wallet in metafields (hodlers_hedge.wallet_address): ${walletMetafield.value}`
    )
    return walletMetafield.value as string
  }

  // Helper function for case-insensitive attribute matching
  const matchesWalletAttribute = (name: string): boolean => {
    const normalized = name.toLowerCase().trim()
    return (
      normalized === "wallet address" ||
      normalized === "wallet_address" ||
      normalized === "walletaddress" ||
      normalized === "wallet" ||
      normalized === "_wallet"
    )
  }

  // 2. Fallback: Check note_attributes (Shopify converts cart attributes to note attributes)
  const noteAttributes = payload.note_attributes || []
  console.log(`📝 [WEBHOOK] note_attributes count: ${noteAttributes.length}`)
  if (noteAttributes.length > 0) {
    console.log(
      `📝 [WEBHOOK] note_attributes:`,
      JSON.stringify(noteAttributes, null, 2)
    )
  }

  const walletFromNote = noteAttributes.find((attr: any) =>
    matchesWalletAttribute(attr.name || "")
  )
  if (walletFromNote?.value) {
    console.log(
      `✅ [WEBHOOK] Found wallet in note_attributes: ${walletFromNote.value}`
    )
    return walletFromNote.value
  }

  // 3. Fallback: Check attributes array
  const attributes = payload.attributes || []
  console.log(`📋 [WEBHOOK] attributes count: ${attributes.length}`)
  if (attributes.length > 0) {
    console.log(
      `📋 [WEBHOOK] attributes:`,
      JSON.stringify(attributes, null, 2)
    )
  }

  const walletFromAttr = attributes.find((attr: any) =>
    matchesWalletAttribute(attr.name || "")
  )
  if (walletFromAttr?.value) {
    console.log(
      `✅ [WEBHOOK] Found wallet in attributes: ${walletFromAttr.value}`
    )
    return walletFromAttr.value
  }

  // 4. Fallback: Check note field (Shopify sometimes puts cart attributes in the note)
  const note = payload.note || ""
  console.log(`📄 [WEBHOOK] note field: ${note ? `"${note.substring(0, 100)}..."` : "empty"}`)
  if (note) {
    // Try to extract wallet from note (format: "Wallet: 5FCjGSizCAnjwWgDTUWoi5Z5hBKLv3cdKgxke9j2e3w6aV33")
    const walletMatch = note.match(
      /(?:wallet|wallet\s*address)[:\s]+([A-Za-z0-9]{47,48})/i
    )
    if (walletMatch && walletMatch[1]) {
      console.log(
        `✅ [WEBHOOK] Found wallet in note field: ${walletMatch[1]}`
      )
      return walletMatch[1]
    }
  }

  // 5. Fallback: Check customer.note field
  const customerNote = payload.customer?.note || ""
  console.log(
    `👤 [WEBHOOK] customer.note: ${customerNote ? `"${customerNote.substring(0, 100)}..."` : "empty"}`
  )
  if (customerNote) {
    const walletMatch = customerNote.match(
      /(?:wallet|wallet\s*address)[:\s]+([A-Za-z0-9]{47,48})/i
    )
    if (walletMatch && walletMatch[1]) {
      console.log(
        `✅ [WEBHOOK] Found wallet in customer.note: ${walletMatch[1]}`
      )
      return walletMatch[1]
    }
  }

  // 6. Fallback: Check line item properties (cart attributes can appear here)
  const lineItems = payload.line_items || []
  console.log(`📦 [WEBHOOK] Checking ${lineItems.length} line items for properties...`)
  
  for (const item of lineItems) {
    const properties = item.properties || []
    if (properties.length > 0) {
      console.log(
        `📦 [WEBHOOK] Line item "${item.title || item.name}" has ${properties.length} properties`
      )
      
      const walletProperty = properties.find((prop: any) =>
        matchesWalletAttribute(prop.name || "")
      )
      if (walletProperty?.value) {
        console.log(
          `✅ [WEBHOOK] Found wallet in line item properties: ${walletProperty.value}`
        )
        return walletProperty.value
      }
    }
  }

  // 7. Fallback: Check custom attributes (alternative format)
  const customAttributes = payload.custom_attributes || []
  console.log(`🏷️ [WEBHOOK] custom_attributes count: ${customAttributes.length}`)
  if (customAttributes.length > 0) {
    console.log(
      `🏷️ [WEBHOOK] custom_attributes:`,
      JSON.stringify(customAttributes, null, 2)
    )
  }

  const walletFromCustom = customAttributes.find((attr: any) =>
    matchesWalletAttribute(attr.name || attr.key || "")
  )
  if (walletFromCustom?.value) {
    console.log(
      `✅ [WEBHOOK] Found wallet in custom_attributes: ${walletFromCustom.value}`
    )
    return walletFromCustom.value
  }

  // 8. Last resort: Check all string fields for wallet-like patterns
  console.log("🔍 [WEBHOOK] Performing deep search for wallet address pattern...")
  const walletPattern = /[A-Za-z0-9]{47,48}/
  
  // Check if any attribute value matches wallet address pattern
  const allAttributes = [
    ...noteAttributes,
    ...attributes,
    ...customAttributes,
  ]
  
  for (const attr of allAttributes) {
    const value = attr.value || attr.Value || ""
    if (typeof value === "string" && walletPattern.test(value)) {
      // Check if it looks like a Polkadot/Substrate address (starts with 1, 3, 5, or C-K)
      if (/^[1-9A-HJ-NP-Za-km-z]{47,48}$/.test(value)) {
        console.log(
          `✅ [WEBHOOK] Found potential wallet address in attribute "${attr.name || attr.key}": ${value}`
        )
        return value
      }
    }
  }

  console.log("⚠️ [WEBHOOK] No wallet address found in metafields or any fallback location")
  return null
}

/**
 * Handle ORDERS_PAID webhook event - track order and let forwarder handle minting
 */
async function handleOrderPaid(payload: any, shop?: string | null) {
  const orderId = String(payload.id)
  const orderNumber = payload.order_number || payload.name || "unknown"
  console.log(`💰 [WEBHOOK] Order ${orderId} (${orderNumber}) paid. Processing minting...`)

  // Extract wallet address from metafields (prioritized) or fallback to attributes
  const walletAddress = extractWalletAddress(payload)
  if (!walletAddress) {
    const errorMsg = `⚠️ [WEBHOOK] No wallet address found on order ${orderId} (${orderNumber}). Skipping mint.`
    console.log(errorMsg)
    
    // Create a failed record in database for tracking
    try {
      const contractId = await getContractByShop(shop || null)
      await prisma.orderReward.upsert({
        where: {
          contractId_orderId: {
            contractId,
            orderId,
          },
        },
        create: {
          contractId,
          orderId,
          wallet: null,
          amount: "0",
          status: "failed",
          error: "No wallet address found in order metafields or attributes",
        },
        update: {
          status: "failed",
          error: "No wallet address found in order metafields or attributes",
        },
      })
      console.log(`📝 [WEBHOOK] Created failed record for order ${orderId} due to missing wallet address`)
    } catch (dbError) {
      console.error(`❌ [WEBHOOK] Failed to create database record:`, dbError)
    }
    return
  }

  console.log(`🔗 [WEBHOOK] Wallet address extracted: ${walletAddress}`)

  // Get contract ID and configuration
  const contractId = await getContractByShop(shop || null)
  
  // Get contract to retrieve tokensPerOrder configuration
  let contract
  try {
    contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { tokensPerOrder: true },
    })
  } catch (dbError) {
    console.error(`❌ [WEBHOOK] Failed to fetch contract:`, dbError)
  }

  // Get tokens per order from contract config, or default to 100
  const tokensPerOrder = contract?.tokensPerOrder || 100
  
  console.log(`🪙 [WEBHOOK] Order will mint ${tokensPerOrder} tokens for ${walletAddress}`)

  // Create pending record first
  await prisma.orderReward.upsert({
    where: {
      contractId_orderId: {
        contractId,
        orderId,
      },
    },
    create: {
      contractId,
      orderId,
      wallet: walletAddress,
      amount: tokensPerOrder.toString(),
      status: "pending",
    },
    update: {
      status: "pending",
      wallet: walletAddress,
      amount: tokensPerOrder.toString(),
      error: null,
    },
  })

  // Minting will be handled by the forwarder service
  // The forwarder endpoint (lines 563-614) will process the order and mint tokens
  console.log(
    `ℹ️ [WEBHOOK] Order ${orderId} (${orderNumber}) marked as pending. ` +
    `Minting will be handled by forwarder service for wallet ${walletAddress}`
  )
}

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

  // Normalize topic to handle different formats
  const normalizedTopic = topic.toLowerCase().replace(/_/g, "/")
  
  // Handle both orders/create and orders/paid events
  if (normalizedTopic !== "orders/create" && normalizedTopic !== "orders/paid") {
    console.log("ℹ️ [WEBHOOK] Ignoring topic:", topic, "(normalized:", normalizedTopic + ")")
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

  // Handle ORDERS_PAID event for automatic token minting
  if (normalizedTopic === "orders/paid") {
    try {
      // Extract shop domain from headers
      let shop = req.headers.get("x-shopify-shop-domain") || null
      if (shop) {
        shop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "")
        if (!sanitizeShop(shop)) {
          shop = null // Invalid shop format, use default contract
        }
      }
      console.log(`🏪 [WEBHOOK] Processing order for shop: ${shop || "default"}`)
      await handleOrderPaid(body as any, shop)
      console.log(`✅ [WEBHOOK] Order processing completed successfully`)
    } catch (error) {
      const orderId = (body as any)?.id || "unknown"
      const orderNumber = (body as any)?.order_number || (body as any)?.name || "unknown"
      console.error("❌ [WEBHOOK] Error handling order paid:", {
        error: error instanceof Error ? error.message : String(error),
        orderId,
        orderNumber,
        stack: error instanceof Error ? error.stack : undefined,
      })
      
      // Try to create a failed record in database
      try {
        let shop = req.headers.get("x-shopify-shop-domain") || null
        if (shop) {
          shop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "")
          if (!sanitizeShop(shop)) {
            shop = null
          }
        }
        const contractId = await getContractByShop(shop || null)
        await prisma.orderReward.upsert({
          where: {
            contractId_orderId: {
              contractId,
              orderId: String(orderId),
            },
          },
          create: {
            contractId,
            orderId: String(orderId),
            wallet: null,
            amount: "0",
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          },
          update: {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          },
        })
      } catch (dbError) {
        console.error("❌ [WEBHOOK] Failed to create database record for error:", dbError)
      }
      
      // Return 200 OK to prevent Shopify retries (we've logged the error)
    }
    return new Response("ok")
  }

  // Handle orders/create event
  // Check if order is paid and process minting, then forward to Phat endpoint
  const orderPayload = body as any
  const financialStatus = orderPayload.financial_status || ""
  const isPaid = financialStatus === "paid" || normalizedTopic === "orders/paid"
  
  // If order is paid, also process minting (for development using orders/create)
  if (isPaid && normalizedTopic === "orders/create") {
    try {
      // Extract shop domain from headers
      let shop = req.headers.get("x-shopify-shop-domain") || null
      if (shop) {
        shop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "")
        if (!sanitizeShop(shop)) {
          shop = null // Invalid shop format, use default contract
        }
      }
      console.log(`🏪 [WEBHOOK] Processing paid order (from orders/create) for shop: ${shop || "default"}`)
      await handleOrderPaid(orderPayload, shop)
      console.log(`✅ [WEBHOOK] Order minting processing completed successfully`)
    } catch (error) {
      const orderId = orderPayload?.id || "unknown"
      const orderNumber = orderPayload?.order_number || orderPayload?.name || "unknown"
      console.error("❌ [WEBHOOK] Error handling paid order from orders/create:", {
        error: error instanceof Error ? error.message : String(error),
        orderId,
        orderNumber,
        stack: error instanceof Error ? error.stack : undefined,
      })
      // Continue to forward logic even if minting fails
    }
  }

  // Forward to Phat endpoint (existing logic)
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


