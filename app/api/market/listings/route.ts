import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET: Fetch all active listings with filters
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const assetId = url.searchParams.get("assetId")
    const productId = url.searchParams.get("productId")
    const sellerAddress = url.searchParams.get("sellerAddress")
    const status = url.searchParams.get("status") || "active"

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

    // Check if tokenListing model exists
    const tokenListingModel = (prisma as any).tokenListing
    if (!tokenListingModel) {
      console.warn("TokenListing model not available in Prisma client. Please run 'npx prisma generate'")
      return NextResponse.json(
        { error: "TokenListing model not available. Please regenerate Prisma client." },
        { status: 500 }
      )
    }

    const where: any = {}
    if (assetId) where.assetId = parseInt(assetId, 10)
    if (productId) where.productId = productId
    if (sellerAddress) where.sellerAddress = sellerAddress
    if (status) where.status = status

    const listings = await tokenListingModel.findMany({
      where,
      include: {
        productToken: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ listings }, { status: 200 })
  } catch (error) {
    console.error("Error fetching listings:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch listings" },
      { status: 500 }
    )
  }
}

// POST: Create a new listing (validate ownership, check balance)
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { sellerAddress, assetId, productId, quantity, pricePerToken } = body

    // Validation
    if (!sellerAddress || !assetId || !productId || !quantity || !pricePerToken) {
      return NextResponse.json(
        { error: "Missing required fields: sellerAddress, assetId, productId, quantity, pricePerToken" },
        { status: 400 }
      )
    }

    const quantityNum = parseFloat(quantity)
    const priceNum = parseFloat(pricePerToken)

    if (isNaN(quantityNum) || quantityNum <= 0) {
      return NextResponse.json(
        { error: "Quantity must be a positive number" },
        { status: 400 }
      )
    }

    if (isNaN(priceNum) || priceNum <= 0) {
      return NextResponse.json(
        { error: "Price per token must be a positive number" },
        { status: 400 }
      )
    }

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

    // Verify product token exists
    const productToken = await prisma.productToken.findUnique({
      where: { productId },
    })

    if (!productToken || !productToken.assetId) {
      return NextResponse.json(
        { error: "Product token not found or assetId missing" },
        { status: 404 }
      )
    }

    if (productToken.assetId !== parseInt(assetId, 10)) {
      return NextResponse.json(
        { error: "AssetId mismatch with product token" },
        { status: 400 }
      )
    }

    // Check seller's token balance
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
    const forwardToken = process.env.PHAT_FORWARD_TOKEN || ""

    if (!phalaEndpoint || !forwardToken) {
      return NextResponse.json(
        { error: "Phala endpoint or forward token not configured" },
        { status: 500 }
      )
    }

    // Check balance via forwarder
    const endpoint = phalaEndpoint.replace(/\/$/, "")
    const balanceUrl = `${endpoint}/asset/${assetId}/balance/${sellerAddress}`

    try {
      const balanceResponse = await fetch(balanceUrl, {
        method: "GET",
        headers: {
          "x-forward-token": forwardToken,
        },
      })

      if (!balanceResponse.ok) {
        const errorData = await balanceResponse.json().catch(() => ({}))
        return NextResponse.json(
          { error: errorData.message || errorData.error || "Failed to check balance" },
          { status: balanceResponse.status }
        )
      }

      const balanceData = await balanceResponse.json()
      const availableBalance = parseFloat(balanceData.balanceFormatted || balanceData.balance || "0")

      if (availableBalance < quantityNum) {
        return NextResponse.json(
          { error: `Insufficient balance. Available: ${availableBalance}, Requested: ${quantityNum}` },
          { status: 400 }
        )
      }
    } catch (balanceError) {
      console.error("Error checking balance:", balanceError)
      return NextResponse.json(
        { error: "Failed to verify token balance" },
        { status: 500 }
      )
    }

    // Calculate total price
    const totalPrice = (quantityNum * priceNum).toFixed(12)

    // Check if tokenListing model exists
    const tokenListingModel = (prisma as any).tokenListing
    if (!tokenListingModel) {
      console.warn("TokenListing model not available in Prisma client. Please run 'npx prisma generate'")
      return NextResponse.json(
        { error: "TokenListing model not available. Please regenerate Prisma client." },
        { status: 500 }
      )
    }

    // Create listing
    const listing = await tokenListingModel.create({
      data: {
        sellerAddress,
        assetId: parseInt(assetId, 10),
        productId,
        quantity: quantityNum.toString(),
        pricePerToken: priceNum.toString(),
        totalPrice,
        status: "active",
      },
      include: {
        productToken: true,
      },
    })

    return NextResponse.json({ listing }, { status: 201 })
  } catch (error) {
    console.error("Error creating listing:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create listing" },
      { status: 500 }
    )
  }
}

