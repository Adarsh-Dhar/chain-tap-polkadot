import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Manual minting endpoint
 * Allows frontend to trigger minting for a product purchase
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { productId, walletAddress, assetId, quantity = 1 } = body

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
    }

    if (!walletAddress) {
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 })
    }

    if (!assetId) {
      return NextResponse.json({ error: "Asset ID is required" }, { status: 400 })
    }

    const phatUrl = process.env.PHAT_ENDPOINT_URL
    const forwardToken = process.env.PHAT_FORWARD_TOKEN || ""

    if (!phatUrl) {
      return NextResponse.json(
        { error: "Phala endpoint not configured" },
        { status: 500 }
      )
    }

    // Create a mock order structure for the forwarder
    const mockOrder = {
      id: `manual-${Date.now()}`,
      email: "manual-mint@example.com",
      line_items: [
        {
          title: `Product ${productId}`,
          quantity: quantity,
          price: "0.00",
          product_id: productId,
          properties: [
            {
              name: "asset_id",
              value: String(assetId),
            },
          ],
        },
      ],
      note_attributes: [
        {
          name: "wallet_address",
          value: walletAddress,
        },
      ],
      note: `Manual mint for wallet: ${walletAddress}`,
    }

    console.log("🔄 [MANUAL MINT] Triggering mint:", {
      productId,
      assetId,
      walletAddress,
      quantity,
    })

    const endpoint = phatUrl.replace(/\/$/, "")
    
    // Try direct mint endpoint first (simpler and more reliable)
    const directMintUrl = `${endpoint}/mint`
    const forwardUrl = `${endpoint}/forward-order`

    console.log("🔄 [MANUAL MINT] Attempting direct mint at:", directMintUrl)

    try {
      // Try direct mint endpoint first
      const directResponse = await fetch(directMintUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forward-token": forwardToken,
        },
        body: JSON.stringify({
          assetId,
          walletAddress,
          quantity,
        }),
      })

      if (directResponse.ok) {
        const result = await directResponse.json()
        console.log("✅ [MANUAL MINT] Direct mint success:", result)
        return NextResponse.json({
          success: true,
          message: "Token minted successfully",
          txHash: result.txHash,
          result,
        })
      }

      // If direct mint fails, return the error (don't try fallback to avoid confusion)
      const errorData = await directResponse.json().catch(() => ({ error: await directResponse.text().catch(() => "Unknown error") }))
      console.error("❌ [MANUAL MINT] Direct mint failed:", errorData)
      
      return NextResponse.json(
        { 
          error: "Minting failed", 
          details: errorData.error || errorData.message || "Unknown error",
          status: directResponse.status,
        },
        { status: directResponse.status || 500 }
      )
    } catch (error) {
      console.error("❌ [MANUAL MINT] Error:", error)
      return NextResponse.json(
        {
          error: "Failed to trigger minting",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("❌ [MANUAL MINT] Parse error:", error)
    return NextResponse.json(
      {
        error: "Invalid request",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 400 }
    )
  }
}

