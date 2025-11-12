import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET: Get purchase history for current user
export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const buyerAddress = url.searchParams.get("buyerAddress")

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

    // Check if marketTransaction model exists
    const marketTransactionModel = (prisma as any).marketTransaction
    if (!marketTransactionModel) {
      return NextResponse.json(
        { error: "MarketTransaction model not available. Please regenerate Prisma client." },
        { status: 500 }
      )
    }

    const transactions = await marketTransactionModel.findMany({
      where: {
        buyerAddress,
      },
      include: {
        listing: {
          include: {
            productToken: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ transactions }, { status: 200 })
  } catch (error) {
    console.error("Error fetching purchases:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch purchases" },
      { status: 500 }
    )
  }
}

