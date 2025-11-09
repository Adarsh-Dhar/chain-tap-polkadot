import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params
    
    // Extract address from query parameters (wallet address from frontend)
    const url = new URL(req.url)
    const walletAddress = url.searchParams.get("address")

    // Get prisma client
    let prisma
    try {
      const prismaModule = await import("@/lib/prisma")
      prisma = prismaModule.prisma
    } catch (prismaError) {
      console.error("Error importing Prisma:", prismaError)
      return NextResponse.json(
        { error: "Database connection error" },
        { status: 500 }
      )
    }

    // Get product token to find assetId
    const productTokenModel = (prisma as any).productToken
    if (!productTokenModel) {
      return NextResponse.json(
        { error: "ProductToken model not available" },
        { status: 500 }
      )
    }

    // Find the product token - productId might be full Shopify ID or just the numeric part
    const fullProductId = productId.startsWith("gid://") 
      ? productId 
      : `gid://shopify/Product/${productId}`
    
    const productToken = await productTokenModel.findUnique({
      where: { productId: fullProductId },
    })

    if (!productToken || !productToken.assetId) {
      return NextResponse.json(
        { error: "Token not found for this product or assetId is missing" },
        { status: 404 }
      )
    }

    const assetId = productToken.assetId

    // Get contract to find signer address and phalaEndpoint
    const contracts = await prisma.contract.findMany({
      orderBy: { id: "asc" },
      take: 1,
    })

    if (contracts.length === 0) {
      return NextResponse.json(
        { error: "No contract found. Please set up a contract first." },
        { status: 400 }
      )
    }

    const contract = contracts[0]
    const phalaEndpoint = contract.phalaEndpoint || process.env.PHAT_ENDPOINT_URL
    const signerAddress = contract.signerAddress

    if (!phalaEndpoint) {
      return NextResponse.json(
        { error: "Phala endpoint not configured" },
        { status: 400 }
      )
    }

    // Use wallet address if provided, otherwise fall back to signer address
    const address = walletAddress || signerAddress

    if (!address) {
      return NextResponse.json(
        { error: "No address provided and signer address not configured in contract" },
        { status: 400 }
      )
    }

    // Call forwarder to get asset balance
    const forwardToken = process.env.PHAT_FORWARD_TOKEN || ""
    if (!forwardToken) {
      return NextResponse.json(
        { error: "Forward token not configured" },
        { status: 500 }
      )
    }

    const endpoint = phalaEndpoint.replace(/\/$/, "")
    const balanceUrl = `${endpoint}/asset/${assetId}/balance/${address}`

    try {
      const response = await fetch(balanceUrl, {
        method: "GET",
        headers: {
          "x-forward-token": forwardToken,
        },
      })

      if (!response.ok) {
        // Try to parse error response
        let errorData
        try {
          errorData = await response.json()
        } catch {
          errorData = { message: response.statusText }
        }
        
        const errorMessage = errorData.message || errorData.error || `Failed to fetch balance: ${response.statusText}`
        
        // If it's a 404, it might mean the account doesn't exist yet (which is normal for new wallets)
        if (response.status === 404) {
          return NextResponse.json({
            assetId,
            address,
            balance: "0",
            balanceFormatted: "0",
            exists: false,
            decimals: 12
          }, { status: 200 })
        }
        
        console.error("Forwarder error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorMessage,
          url: balanceUrl
        })
        
        return NextResponse.json(
          { error: errorMessage },
          { status: response.status }
        )
      }

      const data = await response.json()
      
      // Handle forwarder response format
      if (data.status === 'success') {
        // Forwarder returns { status: 'success', ...balance }
        return NextResponse.json({
          assetId: data.assetId,
          address: data.address,
          balance: data.balance,
          balanceFormatted: data.balanceFormatted,
          exists: data.exists,
          decimals: data.decimals
        }, { status: 200 })
      }
      
      // If it's already in the expected format, return as is
      return NextResponse.json(data, { status: 200 })
    } catch (fetchError) {
      console.error("Error calling forwarder:", {
        error: fetchError instanceof Error ? fetchError.message : "Unknown error",
        url: balanceUrl
      })
      return NextResponse.json(
        {
          error: "Failed to fetch asset balance",
          details: fetchError instanceof Error ? fetchError.message : "Unknown error"
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("Error fetching token balance:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch token balance",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}

