import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST: Purchase tokens from a listing
export async function POST(
  req: Request,
  { params }: { params: Promise<{ listingId: string }> }
) {
  try {
    const { listingId } = await params
    const id = parseInt(listingId, 10)

    if (isNaN(id)) {
      return NextResponse.json(
        { error: "Invalid listing ID" },
        { status: 400 }
      )
    }

    const body = await req.json()
    const { buyerAddress } = body

    if (!buyerAddress) {
      return NextResponse.json(
        { error: "buyerAddress is required" },
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

    // Check if tokenListing model exists
    const tokenListingModel = (prisma as any).tokenListing
    const marketTransactionModel = (prisma as any).marketTransaction
    if (!tokenListingModel || !marketTransactionModel) {
      return NextResponse.json(
        { error: "Marketplace models not available. Please regenerate Prisma client and run migrations." },
        { status: 500 }
      )
    }

    // Get listing
    const listing = await tokenListingModel.findUnique({
      where: { id },
      include: {
        productToken: true,
      },
    })

    if (!listing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      )
    }

    if (listing.status !== "active") {
      return NextResponse.json(
        { error: `Listing is not active. Current status: ${listing.status}` },
        { status: 400 }
      )
    }

    if (listing.sellerAddress === buyerAddress) {
      return NextResponse.json(
        { error: "Cannot buy your own listing" },
        { status: 400 }
      )
    }

    // Get contract for forwarder endpoint
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

    const endpoint = phalaEndpoint.replace(/\/$/, "")

    // Validate seller still has tokens
    const sellerBalanceUrl = `${endpoint}/asset/${listing.assetId}/balance/${listing.sellerAddress}`
    let sellerBalance = 0

    try {
      const sellerBalanceResponse = await fetch(sellerBalanceUrl, {
        method: "GET",
        headers: {
          "x-forward-token": forwardToken,
        },
      })

      if (sellerBalanceResponse.ok) {
        const sellerBalanceData = await sellerBalanceResponse.json()
        sellerBalance = parseFloat(sellerBalanceData.balanceFormatted || sellerBalanceData.balance || "0")
      }
    } catch (error) {
      console.error("Error checking seller balance:", error)
    }

    const listingQuantity = parseFloat(listing.quantity)
    if (sellerBalance < listingQuantity) {
      return NextResponse.json(
        { error: `Seller no longer has sufficient tokens. Available: ${sellerBalance}, Listed: ${listingQuantity}` },
        { status: 400 }
      )
    }

    // Check buyer's native currency balance (for payment)
    const buyerBalanceUrl = `${endpoint}/balance`
    let buyerBalance = 0

    try {
      const buyerBalanceResponse = await fetch(buyerBalanceUrl, {
        method: "GET",
        headers: {
          "x-forward-token": forwardToken,
        },
      })

      if (buyerBalanceResponse.ok) {
        const buyerBalanceData = await buyerBalanceResponse.json()
        buyerBalance = parseFloat(buyerBalanceData.freeFormatted || buyerBalanceData.free || "0")
      }
    } catch (error) {
      console.error("Error checking buyer balance:", error)
    }

    const totalPrice = parseFloat(listing.totalPrice)
    if (buyerBalance < totalPrice) {
      return NextResponse.json(
        { error: `Insufficient balance. Required: ${totalPrice}, Available: ${buyerBalance}` },
        { status: 400 }
      )
    }

    // Create pending transaction record
    const transaction = await marketTransactionModel.create({
      data: {
        listingId: id,
        sellerAddress: listing.sellerAddress,
        buyerAddress,
        assetId: listing.assetId,
        quantity: listing.quantity,
        pricePerToken: listing.pricePerToken,
        totalPrice: listing.totalPrice,
        txHash: "",
        status: "pending",
      },
    })

    // Update listing status to sold
    await tokenListingModel.update({
      where: { id },
      data: {
        status: "sold",
        buyerAddress,
        // txHash will be updated after transfer
      },
    })

    // Note: Actual token transfer and payment transfer would happen here
    // For now, we return the transaction record and the frontend can handle
    // the actual blockchain transactions via wallet extensions
    // Or we can implement an escrow system

    return NextResponse.json({
      transaction,
      listing,
      message: "Purchase initiated. Please complete the token transfer and payment.",
      note: "This is a placeholder. Actual blockchain transfers need to be implemented via wallet extensions or escrow system.",
    }, { status: 200 })
  } catch (error) {
    console.error("Error processing purchase:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process purchase" },
      { status: 500 }
    )
  }
}

