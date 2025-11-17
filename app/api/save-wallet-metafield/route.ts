import { NextRequest, NextResponse } from "next/server"
import { getAccessToken } from "@/lib/shopify-session"
import { sanitizeShop } from "@/lib/shopify-oauth"

export const dynamic = "force-dynamic"

// Metafield configuration
const METAFIELD_NAMESPACE = "chainTap"
const METAFIELD_KEY = "wallet_address"

/**
 * POST /api/save-wallet-metafield
 * Save wallet address to cart metafield using Shopify Admin API
 */
export async function POST(req: NextRequest) {
  try {
    if (req.method !== "POST") {
      return NextResponse.json(
        { error: "Method not allowed" },
        { status: 405 }
      )
    }

    const body = await req.json()
    const { walletAddress, cartId, shop } = body

    if (!walletAddress || typeof walletAddress !== "string") {
      return NextResponse.json(
        { error: "walletAddress is required" },
        { status: 400 }
      )
    }

    if (!cartId || typeof cartId !== "string") {
      return NextResponse.json(
        { error: "cartId is required" },
        { status: 400 }
      )
    }

    // Get shop from request or use provided shop
    let shopDomain = shop
    if (!shopDomain) {
      // Try to get from URL params
      const url = new URL(req.url)
      shopDomain = url.searchParams.get("shop") || ""
    }

    // Remove protocol if present
    if (shopDomain) {
      shopDomain = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "")
    }

    // Validate shop format
    if (!shopDomain || !sanitizeShop(shopDomain)) {
      return NextResponse.json(
        { error: "Valid shop domain is required" },
        { status: 400 }
      )
    }

    // Get access token for the shop
    const accessToken = await getAccessToken(shopDomain)
    if (!accessToken) {
      return NextResponse.json(
        { 
          error: "No valid access token found. Please authenticate first.",
          redirect: `/api/auth?shop=${encodeURIComponent(shopDomain)}`
        },
        { status: 401 }
      )
    }

    // Convert cart ID to GraphQL GID format
    // Cart token from /cart.js is already the ID, just need to format it
    const cartGid = `gid://shopify/Cart/${cartId}`

    // Build GraphQL mutation
    const mutation = `
      mutation setCartMetafield($cartId: ID!, $metafields: [MetafieldInput!]!) {
        cartMetafieldsSet(cartId: $cartId, metafields: $metafields) {
          userErrors {
            field
            message
          }
        }
      }
    `

    // Build shop-specific GraphQL URL
    const graphqlUrl = `https://${shopDomain}/admin/api/2025-10/graphql.json`

    // Make GraphQL request
    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          cartId: cartGid,
          metafields: [
            {
              namespace: METAFIELD_NAMESPACE,
              key: METAFIELD_KEY,
              value: walletAddress,
              type: "single_line_text_field",
            },
          ],
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("GraphQL request failed:", errorText)
      return NextResponse.json(
        { error: "Failed to set cart metafield", details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Check for GraphQL errors
    if (data.errors) {
      console.error("GraphQL errors:", data.errors)
      return NextResponse.json(
        { error: "GraphQL errors occurred", details: data.errors },
        { status: 500 }
      )
    }

    // Check for user errors from mutation
    const userErrors = data.data?.cartMetafieldsSet?.userErrors || []
    if (userErrors.length > 0) {
      console.error("Cart metafield user errors:", userErrors)
      return NextResponse.json(
        { error: "Failed to set cart metafield", details: userErrors },
        { status: 400 }
      )
    }

    return NextResponse.json({ 
      success: true,
      message: "Wallet address saved to cart metafield successfully"
    })
  } catch (error: any) {
    console.error("Error saving wallet to cart metafield:", error)
    return NextResponse.json(
      { error: error.message || "Failed to save wallet to cart metafield" },
      { status: 500 }
    )
  }
}

