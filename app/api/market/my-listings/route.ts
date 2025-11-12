import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET: Get current user's listings (active, sold, cancelled)
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sellerAddress = url.searchParams.get("sellerAddress")
    const status = url.searchParams.get("status") // optional filter

    if (!sellerAddress) {
      return NextResponse.json(
        { error: "sellerAddress is required" },
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

    const where: any = {
      sellerAddress,
    }

    if (status) {
      where.status = status
    }

    // Check if tokenListing model exists
    const tokenListingModel = (prisma as any).tokenListing
    if (!tokenListingModel) {
      return NextResponse.json(
        { error: "TokenListing model not available. Please regenerate Prisma client." },
        { status: 500 }
      )
    }

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
    console.error("Error fetching user listings:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch listings" },
      { status: 500 }
    )
  }
}

