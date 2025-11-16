import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST /api/store-wallet
 * Store wallet address associated with cart/customer
 */
export async function POST(req: NextRequest) {
  try {
    if (req.method !== "POST") {
      return NextResponse.json(
        { error: "Method not allowed" },
        { status: 405 }
      );
    }

    const body = await req.json();
    const { walletAddress, cartId, customerId, shop } = body;

    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json(
        { error: "Wallet address is required" },
        { status: 400 }
      );
    }

    // Get shop from request or use default
    const shopDomain = shop || "default-shop.myshopify.com";

    // Allow storing wallet without cartId/customerId - will be associated later
    // Store by shop for now, can be updated when cartId is available
    if (!cartId && !customerId) {
      // Store wallet by shop only (temporary, will be updated when cartId is available)
      // This allows wallet to be stored when user connects in main app
      try {
        const wallet = await prisma.walletAddress.create({
          data: {
            walletAddress,
            shop: shopDomain,
            // No cartId or customerId - will be updated later
          },
        });
        return NextResponse.json({ success: true, wallet });
      } catch (error: any) {
        // If wallet already exists for this shop without cartId/customerId, update it
        const existing = await prisma.walletAddress.findFirst({
          where: { 
            shop: shopDomain,
            cartId: null,
            customerId: null,
          },
        });
        
        if (existing) {
          const wallet = await prisma.walletAddress.update({
            where: { id: existing.id },
            data: {
              walletAddress,
              updatedAt: new Date(),
            },
          });
          return NextResponse.json({ success: true, wallet });
        }
        
        throw error;
      }
    }

    // Store or update wallet address
    const walletData = {
      walletAddress,
      shop: shopDomain,
      ...(cartId && { cartId }),
      ...(customerId && { customerId }),
    };

    let wallet;
    if (cartId) {
      // Upsert by cartId
      wallet = await prisma.walletAddress.upsert({
        where: { cartId },
        update: {
          walletAddress,
          customerId: customerId || undefined,
          updatedAt: new Date(),
        },
        create: walletData,
      });
    } else if (customerId) {
      // Find existing by customerId or create new
      const existing = await prisma.walletAddress.findFirst({
        where: { customerId, shop: shopDomain },
      });

      if (existing) {
        wallet = await prisma.walletAddress.update({
          where: { id: existing.id },
          data: {
            walletAddress,
            updatedAt: new Date(),
          },
        });
      } else {
        wallet = await prisma.walletAddress.create({
          data: walletData,
        });
      }
    }

    return NextResponse.json({ success: true, wallet });
  } catch (error: any) {
    console.error("Error storing wallet address:", error);
    return NextResponse.json(
      { error: error.message || "Failed to store wallet address" },
      { status: 500 }
    );
  }
}

