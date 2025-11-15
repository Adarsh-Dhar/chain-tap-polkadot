import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/vip/token
 * Returns the VIP token configuration (productId, threshold)
 */
export async function GET(req: Request) {
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
      return NextResponse.json(
        { error: "ProductToken model not available" },
        { status: 500 }
      )
    }

    // Find the VIP token
    const vipToken = await productTokenModel.findFirst({
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
        handle: true,
        vipTokenThreshold: true,
      },
    })

    if (!vipToken) {
      return NextResponse.json(
        { error: "No VIP token configured" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      productId: vipToken.productId,
      assetId: vipToken.assetId,
      title: vipToken.title,
      handle: vipToken.handle,
      threshold: vipToken.vipTokenThreshold || 1, // Default to 1 if not set
    })
  } catch (error) {
    console.error("Error fetching VIP token:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch VIP token",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/vip/token
 * Sets/updates which token is VIP and the threshold
 * Body: { productId: string, threshold?: number }
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { productId, threshold } = body

    if (!productId || typeof productId !== "string") {
      return NextResponse.json(
        { error: "productId is required and must be a string" },
        { status: 400 }
      )
    }

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

    // Normalize productId
    const fullProductId = productId.startsWith("gid://")
      ? productId
      : `gid://shopify/Product/${productId}`

    // First, unset all existing VIP tokens
    await productTokenModel.updateMany({
      where: {
        isVipToken: true,
      },
      data: {
        isVipToken: false,
        vipTokenThreshold: null,
      },
    })

    // Find the token to set as VIP
    const token = await productTokenModel.findUnique({
      where: { productId: fullProductId },
    })

    if (!token) {
      return NextResponse.json(
        { error: "Token not found for this productId" },
        { status: 404 }
      )
    }

    if (!token.assetId) {
      return NextResponse.json(
        { error: "Token does not have an assetId yet" },
        { status: 400 }
      )
    }

    // Set this token as VIP
    const updatedToken = await productTokenModel.update({
      where: { productId: fullProductId },
      data: {
        isVipToken: true,
        vipTokenThreshold: threshold !== undefined ? threshold : null,
      },
      select: {
        productId: true,
        assetId: true,
        title: true,
        handle: true,
        isVipToken: true,
        vipTokenThreshold: true,
      },
    })

    return NextResponse.json({
      message: "VIP token updated successfully",
      token: updatedToken,
    })
  } catch (error) {
    console.error("Error setting VIP token:", error)
    return NextResponse.json(
      {
        error: "Failed to set VIP token",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/vip/token
 * Same as POST - updates VIP token configuration
 */
export async function PUT(req: Request) {
  return POST(req)
}

