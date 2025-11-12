import { sanitizeShop } from "@/lib/shopify-oauth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
        note
        attributes {
          key
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

const CART_DISCOUNT_CODES_UPDATE_MUTATION = `
  mutation cartDiscountCodesUpdate($cartId: ID!, $discountCodes: [String!]!) {
    cartDiscountCodesUpdate(cartId: $cartId, discountCodes: $discountCodes) {
      cart {
        id
        discountCodes {
          code
        }
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
  assetId?: number | string | null
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { shop, lineItems, walletAddress, discountPercentage } = body

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

    // Create discount code if discount percentage is provided
    let discountCode: string | null = null
    if (discountPercentage && discountPercentage > 0 && discountPercentage < 1) {
      try {
        console.log("🎫 Creating discount code for percentage:", discountPercentage)
        // Use the request URL to determine the base URL for internal API calls
        const requestUrl = new URL(req.url)
        const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`
        const discountResponse = await fetch(`${baseUrl}/api/checkout/discount`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shop: cleanShop,
            discountPercentage,
          }),
        })

        if (discountResponse.ok) {
          const discountData = await discountResponse.json()
          discountCode = discountData.discountCode || null
          console.log("✅ Discount code created:", discountCode)
        } else {
          const errorData = await discountResponse.json().catch(() => ({}))
          console.warn("⚠️ Failed to create discount code, continuing without discount:", errorData.error || "Unknown error")
        }
      } catch (discountError) {
        console.warn("⚠️ Error creating discount code, continuing without discount:", discountError)
        // Don't block checkout if discount creation fails
      }
    }

    // Create cart with requested merchandise
    console.log("🛒 Creating cart for shop:", cleanShop)
    if (walletAddress) {
      console.log("🔐 Attaching wallet address to cart:", walletAddress)
    }
    if (discountCode) {
      console.log("🎫 Attaching discount code to cart:", discountCode)
    }
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
            attributes: (() => {
              const attrs: Array<{ key: string; value: string }> = []
              
              if (walletAddress && typeof walletAddress === "string") {
                attrs.push(
                  {
                    key: "wallet_address",
                    value: walletAddress,
                  },
                  {
                    key: "_wallet",
                    value: walletAddress,
                  }
                )
              }
              
              if (discountCode) {
                attrs.push(
                  {
                    key: "discount_code",
                    value: discountCode,
                  },
                  {
                    key: "_discount_code",
                    value: discountCode,
                  }
                )
              }
              
              return attrs.length > 0 ? attrs : undefined
            })(),
            note: walletAddress && typeof walletAddress === "string"
              ? `Wallet: ${walletAddress}`
              : undefined,
            lines: lineItems.map((item: LineItem) => {
              const lineAttributes =
                item.assetId !== undefined && item.assetId !== null
                  ? [
                      {
                        key: "asset_id",
                        value: String(item.assetId),
                      },
                      {
                        key: "_asset_id",
                        value: String(item.assetId),
                      },
                      {
                        key: "assetId",
                        value: String(item.assetId),
                      },
                    ]
                  : undefined

              return {
                merchandiseId: item.variantId,
                quantity: item.quantity,
                attributes: lineAttributes,
              }
            }),
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

    // Apply discount code directly to cart if we have one
    if (discountCode && cartId) {
      try {
        console.log("🎫 Applying discount code to cart:", {
          discountCode,
          cartId,
          graphqlUrl,
        })

        const mutationBody = {
          query: CART_DISCOUNT_CODES_UPDATE_MUTATION,
          variables: {
            cartId: cartId,
            discountCodes: [discountCode],
          },
        }

        console.log("🔍 Mutation request:", JSON.stringify(mutationBody, null, 2))

        const discountUpdateResponse = await fetch(graphqlUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Storefront-Access-Token": storefrontAccessToken,
          },
          body: JSON.stringify(mutationBody),
        })

        const discountUpdateResponseText = await discountUpdateResponse.text()
        console.log("🔍 Discount update response status:", discountUpdateResponse.status)
        console.log("🔍 Discount update response body:", discountUpdateResponseText)

        if (discountUpdateResponse.ok) {
          let discountUpdateData
          try {
            discountUpdateData = JSON.parse(discountUpdateResponseText)
          } catch (parseError) {
            console.error("❌ Failed to parse discount update response:", parseError)
            console.error("❌ Raw response:", discountUpdateResponseText)
            return
          }

          console.log("🔍 Parsed discount update response:", JSON.stringify(discountUpdateData, null, 2))
          
          if (discountUpdateData.errors) {
            console.error("❌ GraphQL errors applying discount:", JSON.stringify(discountUpdateData.errors, null, 2))
            discountUpdateData.errors.forEach((error: any) => {
              console.error(`❌ GraphQL Error: ${error.message}`, error)
            })
          } else if (discountUpdateData.data?.cartDiscountCodesUpdate?.userErrors?.length > 0) {
            const errors = discountUpdateData.data.cartDiscountCodesUpdate.userErrors
            console.error("⚠️ User errors applying discount code:", JSON.stringify(errors, null, 2))
            errors.forEach((error: any) => {
              console.error(`❌ User Error - Field: ${error.field}, Message: ${error.message}`)
            })
          } else if (discountUpdateData.data?.cartDiscountCodesUpdate?.cart) {
            const appliedCodes = discountUpdateData.data.cartDiscountCodesUpdate.cart.discountCodes
            console.log("✅ Discount code applied to cart successfully:", discountCode)
            console.log("🔍 Applied discount codes in cart:", JSON.stringify(appliedCodes, null, 2))
          } else {
            console.warn("⚠️ Unexpected response structure:", JSON.stringify(discountUpdateData, null, 2))
          }
        } else {
          console.error("❌ Failed to apply discount code to cart:", {
            status: discountUpdateResponse.status,
            statusText: discountUpdateResponse.statusText,
            body: discountUpdateResponseText,
          })
        }
      } catch (discountUpdateError) {
        console.error("❌ Error applying discount code to cart:", discountUpdateError)
        if (discountUpdateError instanceof Error) {
          console.error("❌ Error details:", {
            message: discountUpdateError.message,
            stack: discountUpdateError.stack,
          })
        }
        // Don't block checkout if discount application fails
      }
    }

    // Append return URL for successful checkout
    // Shopify checkout supports return_to parameter for post-purchase redirect
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const returnUrl = `${appUrl}/checkout/success`
    
    try {
      const checkoutUrlWithReturn = new URL(checkoutUrl)
      // Add return_to parameter for successful checkout
      checkoutUrlWithReturn.searchParams.set("return_to", returnUrl)
      
      console.log("✅ Cart created:", cartId)
      console.log("🔗 Checkout URL with return:", checkoutUrlWithReturn.toString())

      return Response.json({
        success: true,
        cartId,
        webUrl: checkoutUrlWithReturn.toString(),
        checkoutUrl: checkoutUrlWithReturn.toString(),
      })
    } catch (urlError) {
      // If URL parsing fails, return original checkout URL
      console.warn("⚠️ Failed to parse checkout URL, using original:", urlError)
      return Response.json({
        success: true,
        cartId,
        webUrl: checkoutUrl,
        checkoutUrl,
      })
    }
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

