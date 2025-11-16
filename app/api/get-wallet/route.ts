import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/get-wallet
 * Get wallet address for a checkout cart
 * Accepts cartId as query parameter
 */
export async function GET(req: NextRequest) {
  try {
    // Get cartId and shop from query parameters
    const { searchParams } = new URL(req.url);
    const cartId = searchParams.get("cartId") || searchParams.get("cart_id");
    const shop = searchParams.get("shop");

    let walletAddress = null;

    // First, try to find by cartId if provided
    if (cartId) {
      const walletRecord = await prisma.walletAddress.findUnique({
        where: { cartId },
        select: {
          walletAddress: true,
        },
      });
      walletAddress = walletRecord?.walletAddress || null;
    }

    // If not found by cartId, try to find by shop (fallback)
    if (!walletAddress && shop) {
      const shopWallet = await prisma.walletAddress.findFirst({
        where: {
          shop: shop,
          // Prefer wallets with cartId (more specific), but also get ones without
        },
        orderBy: {
          updatedAt: 'desc', // Get most recently updated wallet
        },
        select: {
          walletAddress: true,
        },
      });
      walletAddress = shopWallet?.walletAddress || null;
    }

    // If still not found and no cartId/shop, return null
    if (!walletAddress && !cartId && !shop) {
      return NextResponse.json(
        { wallet: null },
        {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, ngrok-skip-browser-warning, Accept",
          },
        }
      );
    }

    // Return response with CORS headers for checkout extensions
    return NextResponse.json(
      { wallet: walletAddress },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }
    );
  } catch (error: any) {
    console.error("Error fetching wallet address:", error);
    return NextResponse.json(
      { wallet: null, error: error.message },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      }
    );
  }
}

// Handle OPTIONS for CORS preflight
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, ngrok-skip-browser-warning, Accept",
      "Access-Control-Max-Age": "86400",
    },
  });
}

