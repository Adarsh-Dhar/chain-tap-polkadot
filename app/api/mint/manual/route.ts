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
    const mintPath = process.env.PHAT_MINT_PATH || "/mint"
    const forwardPath = process.env.PHAT_FORWARD_PATH || "/forward-order"
    const directMintUrl = `${endpoint}${mintPath}`
    const forwardUrl = `${endpoint}${forwardPath}`

    console.log("🔄 [MANUAL MINT] Attempting direct mint at:", directMintUrl)

    try {
      // Helper to POST and extract error text/json
      const postJson = async (url: string, payload: any) => {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forward-token": forwardToken,
          },
          body: JSON.stringify(payload),
        })
        return res
      }
      const extractError = async (res: Response) => {
        try {
          const data = await res.json()
          return data
        } catch {
          try {
            const text = await res.text()
            return { error: text || "Unknown error" }
          } catch {
            return { error: "Unknown error" }
          }
        }
      }
      const errorDigest = async (res: Response, data: any) => ({
        status: res.status,
        statusText: (res as any).statusText,
        url: (res as any).url,
        contentType: res.headers.get("content-type"),
        details: data?.error || data?.message || "Unknown error",
      })

      // Try direct mint endpoint first
      const directResponse = await postJson(directMintUrl, {
        assetId,
        walletAddress,
        quantity,
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

      // If direct mint fails, attempt alternative paths and fallback via forward-order when appropriate
      let directErrorData: any = await extractError(directResponse)
      let directErrorInfo = await errorDigest(directResponse, directErrorData)
      console.error("❌ [MANUAL MINT] Direct mint failed:", directErrorData)

      // If 404/405, try alternate mint path: /api/mint
      let altMintTried = false
      if (directResponse.status === 404 || directResponse.status === 405) {
        const altMintUrl = `${endpoint}/api/mint`
        if (altMintUrl !== directMintUrl) {
          altMintTried = true
          console.log("🔄 [MANUAL MINT] Retrying direct mint at alternate path:", altMintUrl)
          const altMintRes = await postJson(altMintUrl, {
            assetId,
            walletAddress,
            quantity,
          })
          if (altMintRes.ok) {
            const result = await altMintRes.json()
            console.log("✅ [MANUAL MINT] Direct mint (alternate path) success:", result)
            return NextResponse.json({
              success: true,
              message: "Token minted successfully",
              txHash: result.txHash,
              result,
            })
          }
          const altData = await extractError(altMintRes)
          directErrorData = altData
          directErrorInfo = await errorDigest(altMintRes, altData)
          console.error("❌ [MANUAL MINT] Alternate mint path failed:", altData)
        }
      }

      // Fallback only for 404/405 or explicit unsupported errors
      if (directResponse.status === 404 || directResponse.status === 405 || altMintTried) {
        console.log("↪️ [MANUAL MINT] Falling back to forward-order at:", forwardUrl)
        // Forwarder expects the raw order object as the request body
        const forwardResponse = await postJson(forwardUrl, mockOrder)

        if (forwardResponse.ok) {
          const forwardResult = await forwardResponse.json()
          console.log("✅ [MANUAL MINT] Forward-order success:", forwardResult)
          return NextResponse.json({
            success: true,
            message: "Token mint forwarded successfully",
            result: forwardResult,
          })
        }

        // Try alternate forward path: /api/forward-order
        const altForwardUrl = `${endpoint}/api/forward-order`
        console.log("↪️ [MANUAL MINT] Trying alternate forward-order path:", altForwardUrl)
        const altForwardRes = await postJson(altForwardUrl, mockOrder)
        if (altForwardRes.ok) {
          const forwardResult = await altForwardRes.json()
          console.log("✅ [MANUAL MINT] Forward-order (alternate path) success:", forwardResult)
          return NextResponse.json({
            success: true,
            message: "Token mint forwarded successfully",
            result: forwardResult,
          })
        }

        // Fallback failed as well; aggregate errors
        const forwardErrorData = await extractError(forwardResponse)
        const forwardErrorInfo = await errorDigest(forwardResponse, forwardErrorData)
        const altForwardErrorData = await extractError(altForwardRes)
        const altForwardErrorInfo = await errorDigest(altForwardRes, altForwardErrorData)
        console.error("❌ [MANUAL MINT] Forward-order failed:", forwardErrorData)
        console.error("❌ [MANUAL MINT] Forward-order (alternate) failed:", altForwardErrorData)
        return NextResponse.json(
          {
            error: "Minting failed (fallback attempted)",
            details: forwardErrorInfo,
            directError: directErrorInfo,
            altForwardError: altForwardErrorInfo,
            status: forwardResponse.status || altForwardRes.status,
          },
          { status: forwardResponse.status || altForwardRes.status || 500 }
        )
      }

      // Non-fallback-eligible errors: return direct failure details
      return NextResponse.json(
        {
          error: "Minting failed",
          details: directErrorInfo,
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

