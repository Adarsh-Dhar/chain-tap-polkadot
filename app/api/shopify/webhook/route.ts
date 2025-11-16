import { verifyShopifyHmac } from "@/lib/shopify"
import { prisma } from "@/lib/prisma"
import { sanitizeShop } from "@/lib/shopify-oauth"

// Import blockchain utilities (CommonJS module)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const blockchainUtils = require("../../../../my-phala-forwarder/utils/blockchain")
const { calculateTokenAmount, mintAndTransferTokens } = blockchainUtils

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
 * Extract wallet address from order attributes
 * Checks all possible locations where Shopify might store cart attributes
 */
function extractWalletAddress(payload: any): string | null {
  // Debug: Log what we're looking for
  console.log("🔍 [WEBHOOK] Searching for wallet address in order payload...")

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

  // 1. Check note_attributes first (Shopify converts cart attributes to note attributes)
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

  // 2. Check attributes array
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

  // 3. Check note field (Shopify sometimes puts cart attributes in the note)
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

  // 4. Check customer.note field
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

  // 5. Check line item properties (cart attributes can appear here)
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

  // 6. Check custom attributes (alternative format)
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

  // 7. Last resort: Check all string fields for wallet-like patterns
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

  console.log("⚠️ [WEBHOOK] No wallet address found in any location")
  return null
}

/**
 * Handle ORDERS_PAID webhook event - mint tokens automatically
 */
async function handleOrderPaid(payload: any, shop?: string | null) {
  const orderId = String(payload.id)
  console.log(`💰 [WEBHOOK] Order ${orderId} paid. Processing minting...`)

  // Extract wallet address
  const walletAddress = extractWalletAddress(payload)
  if (!walletAddress) {
    console.log("⚠️ [WEBHOOK] No wallet address found on order. Skipping mint.")
    return
  }

  console.log(`🔗 [WEBHOOK] Wallet address: ${walletAddress}`)

  // Get contract ID
  const contractId = await getContractByShop(shop || null)

  // Process line items
  const lineItems = payload.line_items || []
  if (lineItems.length === 0) {
    console.log("⚠️ [WEBHOOK] No line items found. Skipping mint.")
    return
  }

  // Extract product IDs from line items
  const productIds = lineItems
    .map((item: any) => {
      // Try product_id first (most common)
      if (item.product_id) {
        return item.product_id.toString()
      }
      // Log warning if product_id is missing for debugging
      console.warn(`⚠️ [WEBHOOK] Line item missing product_id:`, {
        title: item.title,
        variant_id: item.variant_id,
        sku: item.sku,
      })
      return null
    })
    .filter((id: string | null | undefined): id is string => !!id)

  if (productIds.length === 0) {
    console.log("⚠️ [WEBHOOK] No product IDs found in line items. Skipping mint.")
    // Log line items structure for debugging
    console.log("📦 [WEBHOOK] Line items sample:", JSON.stringify(lineItems.slice(0, 2), null, 2))
    return
  }

  console.log(`📋 [WEBHOOK] Found ${productIds.length} product IDs:`, productIds)

  // Look up assetIds from ProductToken table
  const fullProductIds = productIds.map((id: string) => `gid://shopify/Product/${id}`)
  console.log(`🔍 [WEBHOOK] Looking up ${fullProductIds.length} products in database...`)
  
  const productTokens = await prisma.productToken.findMany({
    where: {
      productId: {
        in: fullProductIds,
      },
    },
  })

  console.log(`🔍 [WEBHOOK] Found ${productTokens.length} product tokens in database`)

  // Create a map of productId -> assetId
  const productAssetMap = new Map<string, number>()
  productTokens.forEach((token) => {
    if (token.assetId) {
      productAssetMap.set(token.productId, token.assetId)
      console.log(`✅ [WEBHOOK] Mapped ${token.productId} -> Asset ${token.assetId}`)
    } else {
      console.warn(`⚠️ [WEBHOOK] Product ${token.productId} has no assetId`)
    }
  })

  // Log products that weren't found in database
  const foundProductIds = new Set(productTokens.map((t) => t.productId))
  const missingProducts = fullProductIds.filter((id: string) => !foundProductIds.has(id))
  if (missingProducts.length > 0) {
    console.warn(`⚠️ [WEBHOOK] ${missingProducts.length} products not found in ProductToken table:`, missingProducts)
  }

  // Group line items by assetId and sum quantities
  const assetGroups = new Map<number, number>() // assetId -> total quantity
  const itemsWithoutAssetId: string[] = []

  for (const item of lineItems) {
    const productId = item.product_id?.toString()
    if (!productId) {
      itemsWithoutAssetId.push(`"${item.title || 'Unknown'}" (no product_id)`)
      continue
    }

    const fullProductId = `gid://shopify/Product/${productId}`
    const assetId = productAssetMap.get(fullProductId)
    if (!assetId) {
      itemsWithoutAssetId.push(`"${item.title || 'Unknown'}" (product ${productId} has no assetId)`)
      console.log(
        `⚠️ [WEBHOOK] No assetId found for product ${productId} (${item.title || 'Unknown'}). Skipping.`
      )
      continue
    }

    const quantity = item.quantity || 0
    const currentQuantity = assetGroups.get(assetId) || 0
    assetGroups.set(assetId, currentQuantity + quantity)
    console.log(
      `📦 [WEBHOOK] Added ${quantity} items of product ${productId} -> Asset ${assetId} (total: ${currentQuantity + quantity})`
    )
  }

  if (itemsWithoutAssetId.length > 0) {
    console.warn(`⚠️ [WEBHOOK] ${itemsWithoutAssetId.length} items skipped:`, itemsWithoutAssetId)
  }

  if (assetGroups.size === 0) {
    console.log(
      "⚠️ [WEBHOOK] No items with assetId found. Skipping mint."
    )
    // Create a failed record
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
        amount: "0",
        status: "failed",
        error: "No products with assetId found",
      },
      update: {
        status: "failed",
        error: "No products with assetId found",
      },
    })
    return
  }

  // Mint tokens for each asset group
  const mintResults: Array<{
    assetId: number
    quantity: number
    txHash?: string
    error?: string
  }> = []

  let hasErrors = false

  // Create pending record first
  const totalQuantity = Array.from(assetGroups.values()).reduce(
    (sum, qty) => sum + qty,
    0
  )
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
      amount: totalQuantity.toString(),
      status: "pending",
    },
    update: {
      status: "pending",
      wallet: walletAddress,
      amount: totalQuantity.toString(),
      error: null,
    },
  })

  // Mint tokens for each asset group
  for (const [assetId, quantity] of assetGroups.entries()) {
    try {
      console.log(
        `🔨 [WEBHOOK] Minting ${quantity} tokens for Asset ${assetId} to ${walletAddress}`
      )

      // Calculate amount: 1 token per 1 item
      const tokenAmountBN = calculateTokenAmount(quantity, 1)

      // Execute minting
      const txHash = await mintAndTransferTokens(
        walletAddress,
        tokenAmountBN,
        assetId
      )

      console.log(`✅ [WEBHOOK] Mint Success! Tx: ${txHash}`)

      mintResults.push({
        assetId,
        quantity,
        txHash,
      })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error"
      console.error(`❌ [WEBHOOK] Minting Failed for asset ${assetId}:`, errorMessage)

      hasErrors = true
      mintResults.push({
        assetId,
        quantity,
        error: errorMessage,
      })
    }
  }

  // Update database record with final status
  if (hasErrors) {
    const errors = mintResults
      .filter((r) => r.error)
      .map((r) => `Asset ${r.assetId}: ${r.error}`)
      .join("; ")

    await prisma.orderReward.update({
      where: {
        contractId_orderId: {
          contractId,
          orderId,
        },
      },
      data: {
        status: "failed",
        error: errors,
      },
    })
  } else {
    // All successful - use first txHash as reference
    const firstTxHash = mintResults.find((r) => r.txHash)?.txHash

    await prisma.orderReward.update({
      where: {
        contractId_orderId: {
          contractId,
          orderId,
        },
      },
      data: {
        status: "success",
        txHash: firstTxHash || null,
      },
    })
  }

  // Log final summary
  const successCount = mintResults.filter((r) => r.txHash).length
  const failCount = mintResults.filter((r) => r.error).length
  console.log(
    `✅ [WEBHOOK] Order ${orderId} processing complete. ` +
      `Success: ${successCount}/${mintResults.length}, Failed: ${failCount}/${mintResults.length}`
  )
  
  if (successCount > 0) {
    console.log(`🎉 [WEBHOOK] Successfully minted tokens for ${successCount} asset(s)`)
  }
  if (failCount > 0) {
    console.error(`❌ [WEBHOOK] Failed to mint tokens for ${failCount} asset(s)`)
  }
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
      await handleOrderPaid(body as any, shop)
    } catch (error) {
      console.error("❌ [WEBHOOK] Error handling order paid:", {
        error: error instanceof Error ? error.message : String(error),
        orderId: (body as any)?.id,
      })
      // Return 200 OK to prevent Shopify retries
    }
    return new Response("ok")
  }

  // Handle orders/create event - forward to Phat endpoint (existing logic)
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


