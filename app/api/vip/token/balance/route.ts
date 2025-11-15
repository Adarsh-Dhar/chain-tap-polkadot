import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// CORS headers - MUST be set on ALL responses
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
}

// Helper to create response with CORS headers - ALWAYS use this
function corsResponse(data: any, status: number = 200) {
  return NextResponse.json(data, {
    status,
    headers: CORS_HEADERS,
  })
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: CORS_HEADERS,
  })
}

/**
 * GET /api/vip/token/balance
 * Returns VIP token balance for a given wallet address
 * Query params: ?address=<wallet_address>
 * 
 * IMPORTANT: This route ALWAYS returns CORS headers, even on errors
 */
export async function GET(req: Request) {
  // CRITICAL: Wrap the entire function to ensure CORS headers are ALWAYS returned
  // This catches errors during module initialization, Prisma client loading, etc.
  try {
    try {
      const url = new URL(req.url)
      const walletAddress = url.searchParams.get("address")

      if (!walletAddress) {
        return corsResponse(
          { error: "address query parameter is required" },
          400
        )
      }

      // Get prisma client with error handling
      let prisma
      try {
        const prismaModule = await import("@/lib/prisma")
        prisma = prismaModule.prisma
      } catch (prismaError) {
        console.error("Error importing Prisma:", prismaError)
        return corsResponse(
          { error: "Database connection error" },
          500
        )
      }

      const productTokenModel = (prisma as any).productToken
      if (!productTokenModel) {
        return corsResponse(
          { error: "ProductToken model not available" },
          500
        )
      }

      // Find ALL VIP tokens (not just one) - handle Prisma schema errors gracefully
      let vipTokens: any[] = []
      try {
        vipTokens = await productTokenModel.findMany({
          where: {
            isVipToken: true,
            assetId: {
              not: null,
            },
          },
          select: {
            productId: true,
            assetId: true,
            title: true,
            vipTokenThreshold: true,
          },
        })
      } catch (prismaQueryError: any) {
        console.error("Prisma query error:", prismaQueryError)
        const errorMessage = prismaQueryError?.message || String(prismaQueryError)
        
        // Check if it's a schema mismatch (Prisma client needs regeneration)
        if (errorMessage.includes("isVipToken") || 
            errorMessage.includes("Unknown argument") ||
            errorMessage.includes("Unknown field")) {
          return corsResponse(
            { 
              error: "Database schema mismatch",
              message: "Server needs restart. Run 'npx prisma generate' and restart the server.",
              details: errorMessage.substring(0, 200)
            },
            500
          )
        }
        // Other Prisma errors
        return corsResponse(
          {
            error: "Database query failed",
            details: errorMessage.substring(0, 200)
          },
          500
        )
      }

      if (vipTokens.length === 0) {
        // Check if there are any tokens at all (with error handling)
        let allTokens: any[] = []
        try {
          allTokens = await productTokenModel.findMany({
            where: {
              assetId: {
                not: null,
              },
            },
            select: {
              productId: true,
              title: true,
              isVipToken: true,
            },
            take: 5,
          })
        } catch (err) {
          console.error("Error fetching tokens:", err)
        }

        // Return 200 with configured: false to avoid console errors
        // This is a valid business logic state, not an error
        return corsResponse({
          configured: false,
          error: "No VIP tokens configured",
          message: "Please mark tokens as VIP using POST /api/vip/token/mark-all",
          availableTokens: allTokens.length > 0 ? allTokens.map((t: any) => ({
            productId: t.productId,
            title: t.title,
          })) : [],
          balance: "0",
          balanceFormatted: "0",
          hasVipAccess: false,
        }, 200)
      }

      // Get contract
      let contracts
      try {
        contracts = await prisma.contract.findMany({
          orderBy: { id: "asc" },
          take: 1,
        })
      } catch (err) {
        console.error("Error fetching contracts:", err)
        return corsResponse(
          { error: "Failed to fetch contract configuration" },
          500
        )
      }

      if (contracts.length === 0) {
        return corsResponse(
          { error: "No contract found. Please set up a contract first." },
          400
        )
      }

      const contract = contracts[0]
      const phalaEndpoint = contract.phalaEndpoint || process.env.PHAT_ENDPOINT_URL

      if (!phalaEndpoint) {
        return corsResponse(
          { error: "Phala endpoint not configured" },
          400
        )
      }

      const forwardToken = process.env.PHAT_FORWARD_TOKEN || ""
      if (!forwardToken) {
        return corsResponse(
          { error: "Forward token not configured" },
          500
        )
      }

      // Get threshold from first VIP token (or use default)
      const threshold = vipTokens[0]?.vipTokenThreshold || 1

      // Fetch balances for ALL VIP tokens and sum them
      const endpoint = phalaEndpoint.replace(/\/$/, "")
      let totalBalance = 0
      let totalBalanceFormatted = "0"
      const tokenBalances: Array<{
        productId: string
        assetId: number
        title: string
        balance: string
        balanceFormatted: string
      }> = []

      for (const vipToken of vipTokens) {
        const balanceUrl = `${endpoint}/asset/${vipToken.assetId}/balance/${walletAddress}`

        try {
          const response = await fetch(balanceUrl, {
            method: "GET",
            headers: {
              "x-forward-token": forwardToken,
            },
          })

          if (response.ok) {
            const data = await response.json()
            
            // Handle forwarder response format
            let balanceData
            if (data.status === 'success') {
              balanceData = {
                balance: data.balance,
                balanceFormatted: data.balanceFormatted,
                exists: data.exists,
                decimals: data.decimals
              }
            } else {
              balanceData = data
            }

            const balance = parseFloat(balanceData.balanceFormatted || balanceData.balance || "0")
            totalBalance += balance

            tokenBalances.push({
              productId: vipToken.productId,
              assetId: vipToken.assetId,
              title: vipToken.title,
              balance: balanceData.balance ?? "0",
              balanceFormatted: balanceData.balanceFormatted ?? "0",
            })
          } else if (response.status === 404) {
            // Account doesn't exist yet (normal for new wallets)
            tokenBalances.push({
              productId: vipToken.productId,
              assetId: vipToken.assetId,
              title: vipToken.title,
              balance: "0",
              balanceFormatted: "0",
            })
          } else {
            // Log error but continue with other tokens
            let errorData
            try {
              errorData = await response.json()
            } catch {
              errorData = { message: response.statusText }
            }
            console.error(`Error fetching balance for asset ${vipToken.assetId}:`, {
              status: response.status,
              error: errorData.message || errorData.error || response.statusText,
            })
          }
        } catch (fetchError) {
          console.error(`Error calling forwarder for asset ${vipToken.assetId}:`, {
            error: fetchError instanceof Error ? fetchError.message : "Unknown error",
            url: balanceUrl
          })
          // Continue with other tokens even if one fails
        }
      }

      // Format total balance
      totalBalanceFormatted = totalBalance.toFixed(12).replace(/\.?0+$/, "")

      return corsResponse({
        productIds: vipTokens.map(t => t.productId),
        assetIds: vipTokens.map(t => t.assetId),
        titles: vipTokens.map(t => t.title),
        threshold: threshold,
        balance: totalBalance.toString(),
        balanceFormatted: totalBalanceFormatted,
        hasVipAccess: totalBalance >= threshold,
        tokenCount: vipTokens.length,
        tokenBalances: tokenBalances, // Individual token balances
      }, 200)
    } catch (innerError) {
      // Catch any errors from the inner try block
      console.error("Inner error in VIP token balance route:", innerError)
      const errorMessage = innerError instanceof Error ? innerError.message : "Unknown error"
      return corsResponse(
        {
          error: "Failed to get VIP token balance",
          details: errorMessage,
        },
        500
      )
    }
  } catch (outerError) {
    // Final safety net - catch ANY error, including initialization errors
    console.error("CRITICAL: Outer error in VIP token balance route:", outerError)
    // Even if everything fails, return CORS headers
    return NextResponse.json(
      {
        error: "Internal server error",
        message: "An unexpected error occurred",
      },
      {
        status: 500,
        headers: CORS_HEADERS,
      }
    )
  }
}
