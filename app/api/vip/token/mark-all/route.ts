import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/vip/token/mark-all
 * Marks all product tokens as VIP tokens
 * Body: { threshold?: number } (optional threshold for all tokens)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { threshold } = body

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

    const productTokenModel = (prisma as any).productToken
    if (!productTokenModel) {
      return NextResponse.json(
        { error: "ProductToken model not available" },
        { status: 500 }
      )
    }

    // Update all tokens with assetId to be VIP tokens
    const result = await productTokenModel.updateMany({
      where: {
        assetId: {
          not: null,
        },
      },
      data: {
        isVipToken: true,
        vipTokenThreshold: threshold !== undefined ? threshold : null,
      },
    })

    return NextResponse.json({
      message: `Successfully marked ${result.count} tokens as VIP tokens`,
      count: result.count,
      threshold: threshold || null,
    })
  } catch (error) {
    console.error("Error marking all tokens as VIP:", error)
    return NextResponse.json(
      {
        error: "Failed to mark all tokens as VIP",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

