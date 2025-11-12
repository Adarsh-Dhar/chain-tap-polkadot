import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET: Get specific listing details
export async function GET(
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
      return NextResponse.json(
        { error: "TokenListing model not available. Please regenerate Prisma client." },
        { status: 500 }
      )
    }

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

    return NextResponse.json({ listing }, { status: 200 })
  } catch (error) {
    console.error("Error fetching listing:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch listing" },
      { status: 500 }
    )
  }
}

// PUT: Update listing (price, quantity)
export async function PUT(
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
    const { quantity, pricePerToken, sellerAddress } = body

    // Validate seller owns the listing
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
      return NextResponse.json(
        { error: "TokenListing model not available. Please regenerate Prisma client." },
        { status: 500 }
      )
    }

    const existingListing = await tokenListingModel.findUnique({
      where: { id },
    })

    if (!existingListing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      )
    }

    if (existingListing.status !== "active") {
      return NextResponse.json(
        { error: "Can only update active listings" },
        { status: 400 }
      )
    }

    if (sellerAddress && existingListing.sellerAddress !== sellerAddress) {
      return NextResponse.json(
        { error: "Unauthorized: You can only update your own listings" },
        { status: 403 }
      )
    }

    const updateData: any = {}

    if (quantity !== undefined) {
      const quantityNum = parseFloat(quantity)
      if (isNaN(quantityNum) || quantityNum <= 0) {
        return NextResponse.json(
          { error: "Quantity must be a positive number" },
          { status: 400 }
        )
      }

      // Check balance if increasing quantity
      if (quantityNum > parseFloat(existingListing.quantity)) {
        const contracts = await prisma.contract.findMany({
          orderBy: { id: "asc" },
          take: 1,
        })

        if (contracts.length === 0) {
          return NextResponse.json(
            { error: "No contract found" },
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
        const balanceUrl = `${endpoint}/asset/${existingListing.assetId}/balance/${existingListing.sellerAddress}`

        try {
          const balanceResponse = await fetch(balanceUrl, {
            method: "GET",
            headers: {
              "x-forward-token": forwardToken,
            },
          })

          if (balanceResponse.ok) {
            const balanceData = await balanceResponse.json()
            const availableBalance = parseFloat(balanceData.balanceFormatted || balanceData.balance || "0")
            const currentlyListed = parseFloat(existingListing.quantity)
            const newQuantity = quantityNum

            if (availableBalance < newQuantity - currentlyListed) {
              return NextResponse.json(
                { error: `Insufficient balance to increase quantity. Available: ${availableBalance}, Currently listed: ${currentlyListed}, New quantity: ${newQuantity}` },
                { status: 400 }
              )
            }
          }
        } catch (balanceError) {
          console.error("Error checking balance:", balanceError)
          return NextResponse.json(
            { error: "Failed to verify token balance" },
            { status: 500 }
          )
        }
      }

      updateData.quantity = quantityNum.toString()
    }

    if (pricePerToken !== undefined) {
      const priceNum = parseFloat(pricePerToken)
      if (isNaN(priceNum) || priceNum <= 0) {
        return NextResponse.json(
          { error: "Price per token must be a positive number" },
          { status: 400 }
        )
      }
      updateData.pricePerToken = priceNum.toString()
    }

    // Recalculate total price
    const finalQuantity = updateData.quantity ? parseFloat(updateData.quantity) : parseFloat(existingListing.quantity)
    const finalPrice = updateData.pricePerToken ? parseFloat(updateData.pricePerToken) : parseFloat(existingListing.pricePerToken)
    updateData.totalPrice = (finalQuantity * finalPrice).toFixed(12)

    const updatedListing = await tokenListingModel.update({
      where: { id },
      data: updateData,
      include: {
        productToken: true,
      },
    })

    return NextResponse.json({ listing: updatedListing }, { status: 200 })
  } catch (error) {
    console.error("Error updating listing:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update listing" },
      { status: 500 }
    )
  }
}

// DELETE: Cancel listing
export async function DELETE(
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

    const url = new URL(req.url)
    const sellerAddress = url.searchParams.get("sellerAddress")

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
      return NextResponse.json(
        { error: "TokenListing model not available. Please regenerate Prisma client." },
        { status: 500 }
      )
    }

    const existingListing = await tokenListingModel.findUnique({
      where: { id },
    })

    if (!existingListing) {
      return NextResponse.json(
        { error: "Listing not found" },
        { status: 404 }
      )
    }

    if (sellerAddress && existingListing.sellerAddress !== sellerAddress) {
      return NextResponse.json(
        { error: "Unauthorized: You can only cancel your own listings" },
        { status: 403 }
      )
    }

    if (existingListing.status !== "active") {
      return NextResponse.json(
        { error: "Can only cancel active listings" },
        { status: 400 }
      )
    }

    const updatedListing = await tokenListingModel.update({
      where: { id },
      data: {
        status: "cancelled",
      },
      include: {
        productToken: true,
      },
    })

    return NextResponse.json({ listing: updatedListing }, { status: 200 })
  } catch (error) {
    console.error("Error cancelling listing:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to cancel listing" },
      { status: 500 }
    )
  }
}

