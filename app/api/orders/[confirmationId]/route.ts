import { NextResponse } from "next/server"
import { getAccessToken } from "@/lib/shopify-session"
import { sanitizeShop } from "@/lib/shopify-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ORDER_QUERY = `
  query getOrderByNumber($orderNumber: String!) {
    orders(first: 1, query: $orderNumber) {
      edges {
        node {
          id
          name
          email
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 250) {
            edges {
              node {
                id
                title
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                product {
                  id
                }
                variant {
                  id
                }
                customAttributes {
                  key
                  value
                }
              }
            }
          }
          customAttributes {
            key
            value
          }
          note
        }
      }
    }
  }
`

export async function GET(
  req: Request,
  { params }: { params: Promise<{ confirmationId: string }> }
) {
  try {
    const { confirmationId } = await params
    const { searchParams } = new URL(req.url)
    const shop = searchParams.get("shop")

    if (!confirmationId) {
      return NextResponse.json(
        { error: "confirmationId is required" },
        { status: 400 }
      )
    }

    if (!shop) {
      return NextResponse.json(
        { error: "shop parameter is required" },
        { status: 400 }
      )
    }

    // Clean and validate shop
    const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "")
    if (!sanitizeShop(cleanShop)) {
      return NextResponse.json(
        { error: "Invalid shop domain format" },
        { status: 400 }
      )
    }

    // Get access token
    const accessToken = await getAccessToken(cleanShop)
    if (!accessToken) {
      return NextResponse.json(
        { error: "No valid access token found. Please authenticate first." },
        { status: 401 }
      )
    }

    // Query Shopify Admin API
    const graphqlUrl = `https://${cleanShop}/admin/api/2025-10/graphql.json`
    const orderQuery = `name:${confirmationId}`

    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({
        query: ORDER_QUERY,
        variables: {
          orderNumber: orderQuery,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("❌ [ORDER FETCH] Shopify API error:", errorText)
      return NextResponse.json(
        { error: "Failed to fetch order from Shopify", details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()

    if (data.errors) {
      console.error("❌ [ORDER FETCH] GraphQL errors:", data.errors)
      return NextResponse.json(
        { error: "GraphQL errors", details: data.errors },
        { status: 400 }
      )
    }

    const orders = data.data?.orders?.edges || []
    if (orders.length === 0) {
      return NextResponse.json(
        { error: "Order not found" },
        { status: 404 }
      )
    }

    const order = orders[0].node

    // Extract wallet address from custom attributes or note field
    let walletAddress: string | null = null
    
    // Check custom attributes first
    if (order.customAttributes) {
      for (const attr of order.customAttributes) {
        const key = attr.key || ""
        const value = attr.value || ""
        if (
          (key === "wallet_address" || key === "_wallet" || key === "wallet") &&
          value
        ) {
          walletAddress = value
          break
        }
      }
    }
    
    // Also check note field for wallet address (format: "Wallet: <address>")
    if (!walletAddress && order.note) {
      const walletMatch = order.note.match(/Wallet:\s*([A-Za-z0-9]+)/i)
      if (walletMatch && walletMatch[1]) {
        walletAddress = walletMatch[1]
      }
    }

    // Extract asset IDs from line items
    const lineItems = order.lineItems.edges.map((edge: any) => {
      const item = edge.node
      let assetId: number | null = null

      // Try to get assetId from custom attributes
      if (item.customAttributes) {
        for (const attr of item.customAttributes) {
          if (
            (attr.key === "asset_id" ||
              attr.key === "_asset_id" ||
              attr.key === "assetId") &&
            attr.value
          ) {
            const parsed = parseInt(attr.value, 10)
            if (!isNaN(parsed)) {
              assetId = parsed
            }
          }
        }
      }

      return {
        id: item.id,
        title: item.title,
        quantity: item.quantity,
        price: parseFloat(item.originalUnitPriceSet?.shopMoney?.amount || "0"),
        currencyCode: item.originalUnitPriceSet?.shopMoney?.currencyCode || "USD",
        productId: item.product?.id || null,
        variantId: item.variant?.id || null,
        assetId,
      }
    })

    const orderTotal = parseFloat(
      order.totalPriceSet?.shopMoney?.amount || "0"
    )
    const currencyCode = order.totalPriceSet?.shopMoney?.currencyCode || "USD"

    return NextResponse.json({
      orderId: order.id,
      orderNumber: order.name,
      email: order.email,
      totalPrice: orderTotal,
      currencyCode,
      walletAddress,
      lineItems,
    })
  } catch (error) {
    console.error("❌ [ORDER FETCH] Error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

