import { sanitizeShop } from "@/lib/shopify-oauth"
import { getAccessToken } from "@/lib/shopify-session"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Using REST API instead of GraphQL since priceRuleCreate mutation doesn't exist in Admin API

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { shop, discountPercentage } = body

    if (!shop) {
      return Response.json(
        { error: "Shop parameter is required" },
        { status: 400 }
      )
    }

    if (discountPercentage === undefined || discountPercentage === null) {
      return Response.json(
        { error: "Discount percentage is required" },
        { status: 400 }
      )
    }

    if (discountPercentage <= 0 || discountPercentage >= 1) {
      return Response.json(
        { error: "Discount percentage must be between 0 and 1 (exclusive)" },
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

    // Get Admin API access token
    const accessToken = await getAccessToken(cleanShop)
    if (!accessToken) {
      return Response.json(
        { error: "No valid access token found. Please authenticate first." },
        { status: 401 }
      )
    }

    // Build Admin API REST URL (using REST API instead of GraphQL)
    const restApiUrl = `https://${cleanShop}/admin/api/2025-07/price_rules.json`

    // Generate unique discount code
    const discountCode = `TOKEN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`

    // Convert discount percentage to percentage value (e.g., 0.225 -> 22.5)
    const percentageValue = discountPercentage * 100

    // Step 1: Create price rule first (without discount codes)
    // Creating discount codes inline can cause timing issues
    // For percentage discounts, value should be positive (Shopify applies it as discount automatically)
    const priceRuleData = {
      price_rule: {
        title: `Token Discount ${percentageValue.toFixed(2)}%`,
        target_type: "line_item",
        target_selection: "all",
        allocation_method: "across",
        value_type: "percentage",
        value: percentageValue.toFixed(2), // Positive value for percentage discounts
        customer_selection: "all",
        starts_at: new Date().toISOString(),
        usage_limit: 1, // One-time use
      }
    }

    console.log("🎫 Creating price rule:", {
      shop: cleanShop,
      percentageValue,
      priceRuleData: JSON.stringify(priceRuleData, null, 2),
    })

    const priceRuleResponse = await fetch(restApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify(priceRuleData),
    })

    const priceRuleResponseText = await priceRuleResponse.text()
    console.log("🔍 Price rule response status:", priceRuleResponse.status)
    console.log("🔍 Price rule response body:", priceRuleResponseText)

    if (!priceRuleResponse.ok) {
      console.error("❌ Price rule creation failed:", {
        status: priceRuleResponse.status,
        statusText: priceRuleResponse.statusText,
        body: priceRuleResponseText,
      })
      return Response.json(
        { error: "Failed to create price rule", details: priceRuleResponseText },
        { status: priceRuleResponse.status }
      )
    }

    let responseData
    try {
      responseData = JSON.parse(priceRuleResponseText)
    } catch (parseError) {
      console.error("❌ Failed to parse price rule response:", parseError)
      return Response.json(
        { error: "Failed to parse price rule response", details: priceRuleResponseText },
        { status: 500 }
      )
    }

    console.log("🔍 Parsed price rule response:", JSON.stringify(responseData, null, 2))

    // REST API returns the price rule directly
    const priceRule = responseData.price_rule

    if (!priceRule || !priceRule.id) {
      console.error("❌ Price rule ID missing", {
        responseData,
        hasPriceRule: !!responseData.price_rule,
        priceRuleId: responseData.price_rule?.id,
      })
      return Response.json(
        { error: "Failed to create price rule: Missing price rule ID" },
        { status: 500 }
      )
    }

    const priceRuleId = priceRule.id
    console.log("✅ Price rule created successfully:", {
      priceRuleId,
      priceRule: JSON.stringify(priceRule, null, 2),
    })

    // Step 2: Create discount code separately and associate it with the price rule
    // This ensures the discount code is properly created and immediately available
    const discountCodeUrl = `https://${cleanShop}/admin/api/2025-07/price_rules/${priceRuleId}/discount_codes.json`
    
    const discountCodeData = {
      discount_code: {
        code: discountCode
      }
    }

    console.log("🎫 Creating discount code for price rule:", {
      priceRuleId,
      discountCode,
      discountCodeUrl,
      discountCodeData: JSON.stringify(discountCodeData, null, 2),
    })

    const discountCodeResponse = await fetch(discountCodeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify(discountCodeData),
    })

    const discountCodeResponseText = await discountCodeResponse.text()
    console.log("🔍 Discount code response status:", discountCodeResponse.status)
    console.log("🔍 Discount code response body:", discountCodeResponseText)

    if (!discountCodeResponse.ok) {
      console.error("❌ Discount code creation failed:", {
        status: discountCodeResponse.status,
        statusText: discountCodeResponse.statusText,
        body: discountCodeResponseText,
      })
      // Try to delete the price rule if discount code creation fails
      try {
        await fetch(`https://${cleanShop}/admin/api/2025-07/price_rules/${priceRuleId}.json`, {
          method: "DELETE",
          headers: {
            "X-Shopify-Access-Token": accessToken,
          },
        })
      } catch (deleteError) {
        // Ignore deletion errors
        console.warn("⚠️ Failed to clean up price rule:", deleteError)
      }
      
      return Response.json(
        { error: "Failed to create discount code", details: discountCodeResponseText },
        { status: discountCodeResponse.status }
      )
    }

    let discountCodeResponseData
    try {
      discountCodeResponseData = JSON.parse(discountCodeResponseText)
    } catch (parseError) {
      console.error("❌ Failed to parse discount code response:", parseError)
      return Response.json(
        { error: "Failed to parse discount code response", details: discountCodeResponseText },
        { status: 500 }
      )
    }

    console.log("🔍 Parsed discount code response:", JSON.stringify(discountCodeResponseData, null, 2))

    const createdDiscountCode = discountCodeResponseData.discount_code

    if (!createdDiscountCode || !createdDiscountCode.code) {
      console.error("❌ Discount code missing from response", {
        discountCodeResponseData,
        hasDiscountCode: !!discountCodeResponseData.discount_code,
        code: discountCodeResponseData.discount_code?.code,
      })
      return Response.json(
        { error: "Failed to create discount code: Missing code in response" },
        { status: 500 }
      )
    }

    const createdCode = createdDiscountCode.code

    // Add a small delay to ensure discount code is fully propagated in Shopify's system
    console.log("⏳ Waiting 500ms for discount code propagation...")
    await new Promise(resolve => setTimeout(resolve, 500))

    console.log("✅ Price rule and discount code created:", {
      priceRuleId,
      discountCode: createdCode,
      fullDiscountCode: JSON.stringify(createdDiscountCode, null, 2),
    })

    return Response.json({
      success: true,
      discountCode: createdCode,
      priceRuleId,
      percentageValue,
    })
  } catch (error) {
    console.error("❌ Discount API error:", error)
    return Response.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

