import { NextRequest, NextResponse } from "next/server"
import { getShopifySession } from "@/lib/shopify-session"
import { prisma } from "@/lib/prisma"
import { sanitizeShop } from "@/lib/shopify-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/shop/session
 * Get Shopify session data for a shop or all shops
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const shop = searchParams.get("shop")

    // If shop parameter is provided, get that specific session
    if (shop) {
      const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "")
      if (!sanitizeShop(cleanShop)) {
        return NextResponse.json({ error: "Invalid shop domain format" }, { status: 400 })
      }

      const session = await getShopifySession(cleanShop)
      if (!session) {
        return NextResponse.json({ error: "No session found for this shop" }, { status: 404 })
      }

      return NextResponse.json({
        shop: cleanShop,
        session: {
          id: session.id,
          shop: session.shop,
          scope: session.scope,
          isOnline: session.isOnline,
          expiresAt: session.expiresAt?.toISOString() || null,
          associatedUserId: session.associatedUserId?.toString() || null,
          associatedUserEmail: session.associatedUserEmail || null,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
          hasAccessToken: !!session.accessToken,
          // Don't expose the actual access token for security
        },
      })
    }

    // If no shop parameter, get all sessions
    const allSessions = await prisma.shopifySession.findMany({
      orderBy: { updatedAt: "desc" },
    })

    return NextResponse.json({
      total: allSessions.length,
      sessions: allSessions.map((session) => ({
        id: session.id,
        shop: session.shop,
        scope: session.scope,
        isOnline: session.isOnline,
        expiresAt: session.expiresAt?.toISOString() || null,
        associatedUserId: session.associatedUserId?.toString() || null,
        associatedUserEmail: session.associatedUserEmail || null,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        hasAccessToken: !!session.accessToken,
        isExpired: session.isOnline && session.expiresAt && session.expiresAt < new Date(),
      })),
    })
  } catch (error) {
    console.error("Error fetching shop session:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

