import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
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

    // Safely check if productToken model exists
    const productTokenModel = (prisma as any).productToken
    if (!productTokenModel) {
      console.warn("ProductToken model not available in Prisma client")
      // Return empty array if model doesn't exist yet
      return NextResponse.json([])
    }

    // Fetch all product tokens
    const tokens = await productTokenModel.findMany({
      select: {
        productId: true,
        assetId: true,
        title: true,
      },
      where: {
        assetId: {
          not: null,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // Check for duplicate assetIds (this shouldn't happen but let's detect it)
    const assetIdMap = new Map<number, string[]>()
    tokens.forEach((token: { productId: string; assetId: number | null }) => {
      if (token.assetId) {
        if (!assetIdMap.has(token.assetId)) {
          assetIdMap.set(token.assetId, [])
        }
        assetIdMap.get(token.assetId)!.push(token.productId)
      }
    })

    // Log any duplicates
    assetIdMap.forEach((productIds, assetId) => {
      if (productIds.length > 1) {
        console.error(`⚠️  DUPLICATE ASSET ID DETECTED: Asset ${assetId} is assigned to ${productIds.length} products:`, productIds)
      }
    })

    console.log(`Found ${tokens.length} product tokens in database`)
    return NextResponse.json(tokens)
  } catch (error) {
    console.error("Error fetching product tokens:", error)
    return NextResponse.json(
      { error: "Failed to fetch product tokens" },
      { status: 500 }
    )
  }
}

