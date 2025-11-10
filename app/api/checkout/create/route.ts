import { sanitizeShop } from "@/lib/shopify-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`

interface LineItem {
  variantId: string
  quantity: number
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { shop, lineItems } = body

    if (!shop) {
      return Response.json(
        { error: "Shop parameter is required" },
        { status: 400 }
      )
    }

    if (!lineItems || !Array.isArray(lineItems) || lineItems.length === 0) {
      return Response.json(
        { error: "Line items are required and must be a non-empty array" },
        { status: 400 }
      )
    }

    // Validate shop format
    const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "")
    if (!sanitizeShop(cleanShop)) {
      return Response.json(
        { error: "Invalid shop domain format" },
        { status: 400 }
      )
    }

    // Get Storefront access token from environment
    // This should be set in .env.local as SHOPIFY_STOREFRONT_ACCESS_TOKEN
    const storefrontAccessToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN

    if (!storefrontAccessToken) {
      console.error("❌ Storefront access token not configured")
      return Response.json(
        { 
          error: "Storefront access token not configured. Please set SHOPIFY_STOREFRONT_ACCESS_TOKEN in environment variables.",
          hint: "You can generate a Storefront API access token in Shopify Admin → Settings → Apps and sales channels → Develop apps → Your app → API credentials → Storefront API"
        },
        { status: 500 }
      )
    }

    // Build Storefront API URL (no "admin" in path)
    const graphqlUrl = `https://${cleanShop}/api/2025-10/graphql.json`

    // Create cart with requested merchandise
    console.log("🛒 Creating cart for shop:", cleanShop)
    const createResponse = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": storefrontAccessToken,
      },
      body: JSON.stringify({
        query: CART_CREATE_MUTATION,
        variables: {
          input: {
            lines: lineItems.map((item: LineItem) => ({
              merchandiseId: item.variantId,
              quantity: item.quantity,
            })),
          },
        },
      }),
    })

    if (!createResponse.ok) {
      const errorText = await createResponse.text()
      console.error("❌ Checkout creation failed:", errorText)
      return Response.json(
        { error: "Failed to create checkout", details: errorText },
        { status: createResponse.status }
      )
    }

    const createData = await createResponse.json()

    if (createData.errors) {
      console.error("❌ GraphQL errors:", createData.errors)
      return Response.json(
        { error: "GraphQL errors", details: createData.errors },
        { status: 400 }
      )
    }

    if (createData.data?.cartCreate?.userErrors?.length > 0) {
      const errors = createData.data.cartCreate.userErrors
      console.error("❌ Cart creation errors:", errors)
      return Response.json(
        { error: "Cart creation failed", details: errors },
        { status: 400 }
      )
    }

    const cartId = createData.data?.cartCreate?.cart?.id
    const checkoutUrl = createData.data?.cartCreate?.cart?.checkoutUrl

    if (!cartId || !checkoutUrl) {
      console.error("❌ Cart response missing id or checkoutUrl", createData)
      return Response.json(
        { error: "Failed to create cart: Missing cart ID or checkout URL" },
        { status: 500 }
      )
    }

    console.log("✅ Cart created:", cartId, "checkoutUrl:", checkoutUrl)

    return Response.json({
      success: true,
      cartId,
      webUrl: checkoutUrl,
      checkoutUrl,
    })
  } catch (error) {
    console.error("❌ Checkout API error:", error)
    return Response.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

