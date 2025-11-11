import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAccessToken } from "@/lib/shopify-session"
import { sanitizeShop } from "@/lib/shopify-oauth"

// Import blockchain utilities (CommonJS module)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const blockchainUtils = require("../../../../../my-phala-forwarder/utils/blockchain")
const { calculateTokenAmount, mintAndTransferTokens } = blockchainUtils

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

/**
 * Get default contract ID (use first contract or default to 1)
 */
async function getDefaultContractId(): Promise<number> {
  try {
    const contract = await prisma.contract.findFirst({
      orderBy: { id: "asc" },
    })
    return contract?.id || 1
  } catch (error) {
    console.error("Error getting default contract:", error)
    return 1
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ confirmationId: string }> }
) {
  try {
    const { confirmationId } = await params
    const body = await req.json()
    const { walletAddress, shop } = body

    if (!confirmationId) {
      return NextResponse.json(
        { error: "confirmationId is required" },
        { status: 400 }
      )
    }

    if (!walletAddress) {
      return NextResponse.json(
        { error: "walletAddress is required" },
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

    // Get default contract ID
    const contractId = await getDefaultContractId()

    // Check if order has already been minted
    const existingReward = await prisma.orderReward.findUnique({
      where: {
        contractId_orderId: {
          contractId,
          orderId: confirmationId,
        },
      },
    })

    if (existingReward) {
      if (existingReward.status === "success") {
        return NextResponse.json(
          {
            error: "Order has already been minted",
            existingReward: {
              id: existingReward.id,
              status: existingReward.status,
              txHash: existingReward.txHash,
              amount: existingReward.amount,
            },
          },
          { status: 409 }
        )
      }
      // If status is pending or failed, we can retry
    }

    // Fetch order from Shopify
    const accessToken = await getAccessToken(cleanShop)
    if (!accessToken) {
      return NextResponse.json(
        { error: "No valid access token found. Please authenticate first." },
        { status: 401 }
      )
    }

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
      console.error("❌ [ORDER MINT] Shopify API error:", errorText)
      return NextResponse.json(
        { error: "Failed to fetch order from Shopify", details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()

    if (data.errors) {
      console.error("❌ [ORDER MINT] GraphQL errors:", data.errors)
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
    const orderTotal = parseFloat(
      order.totalPriceSet?.shopMoney?.amount || "0"
    )

    if (orderTotal <= 0) {
      return NextResponse.json(
        { error: "Order total is invalid or zero" },
        { status: 400 }
      )
    }

    // Define type for line item
    type LineItem = {
      id: string
      title: string
      quantity: number
      price: number
      productId: string | null
      assetId: number | null
    }

    // Get line items with product IDs
    const lineItems: LineItem[] = order.lineItems.edges.map((edge: any) => {
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
        productId: item.product?.id || null,
        assetId,
      }
    })

    // Get assetIds from ProductToken table for products that don't have assetId in order
    const productIds = lineItems
      .map((item: LineItem) => item.productId)
      .filter((id: string | null): id is string => id !== null)

    const productTokens = await prisma.productToken.findMany({
      where: {
        productId: {
          in: productIds,
        },
      },
    })

    // Create a map of productId -> assetId
    const productAssetMap = new Map<string, number>()
    productTokens.forEach((token) => {
      if (token.assetId) {
        productAssetMap.set(token.productId, token.assetId)
      }
    })

    // Update line items with assetIds from database
    const lineItemsWithAssets = lineItems.map((item: LineItem) => {
      if (!item.assetId && item.productId) {
        const assetId = productAssetMap.get(item.productId)
        if (assetId) {
          item.assetId = assetId
        }
      }
      return item
    })

    // Filter out items without assetId
    const itemsToMint = lineItemsWithAssets.filter(
      (item: LineItem) => item.assetId !== null && item.assetId !== undefined
    )

    if (itemsToMint.length === 0) {
      // Create a failed record
      await prisma.orderReward.upsert({
        where: {
          contractId_orderId: {
            contractId,
            orderId: confirmationId,
          },
        },
        create: {
          contractId,
          orderId: confirmationId,
          wallet: walletAddress,
          amount: "0",
          status: "failed",
          error: "No products with assetId found",
        },
        update: {
          status: "failed",
          error: "No products with assetId found",
        },
      })

      return NextResponse.json(
        {
          error: "No products with assetId found. Please ensure all products have tokens created.",
        },
        { status: 400 }
      )
    }

    // Calculate total tokens: orderTotal × 10 (tokens per dollar)
    const tokenRate = 10 // tokens per dollar
    const totalTokens = orderTotal * tokenRate

    // Group items by assetId to mint once per asset
    const assetGroups = new Map<number, { items: typeof itemsToMint; totalPrice: number }>()
    
    for (const item of itemsToMint) {
      const assetId = item.assetId!
      const itemTotal = item.price * item.quantity
      
      if (!assetGroups.has(assetId)) {
        assetGroups.set(assetId, { items: [], totalPrice: 0 })
      }
      
      const group = assetGroups.get(assetId)!
      group.items.push(item)
      group.totalPrice += itemTotal
    }

    // Mint tokens for each asset group
    const mintResults: Array<{
      assetId: number
      amount: string
      txHash?: string
      error?: string
    }> = []

    let totalMinted = 0
    let hasErrors = false

    // Create pending record first
    await prisma.orderReward.upsert({
      where: {
        contractId_orderId: {
          contractId,
          orderId: confirmationId,
        },
      },
      create: {
        contractId,
        orderId: confirmationId,
        wallet: walletAddress,
        amount: totalTokens.toString(),
        status: "pending",
      },
      update: {
        status: "pending",
        wallet: walletAddress,
        amount: totalTokens.toString(),
        error: null,
      },
    })

    // Mint tokens for each asset group
    for (const [assetId, group] of assetGroups.entries()) {
      try {
        // Calculate tokens for this asset: (group total price) × 10
        const assetTokenAmount = group.totalPrice * tokenRate
        const tokenAmountBN = calculateTokenAmount(assetTokenAmount, tokenRate)

        console.log(
          `🪙 [ORDER MINT] Minting ${assetTokenAmount} tokens (${tokenAmountBN.toString()} smallest units) for asset ${assetId} to ${walletAddress}`
        )

        const txHash = await mintAndTransferTokens(
          walletAddress,
          tokenAmountBN,
          assetId
        )

        totalMinted += assetTokenAmount
        mintResults.push({
          assetId,
          amount: assetTokenAmount.toString(),
          txHash,
        })

        console.log(
          `✅ [ORDER MINT] Successfully minted tokens for asset ${assetId}. TX: ${txHash}`
        )
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error"
        console.error(
          `❌ [ORDER MINT] Failed to mint tokens for asset ${assetId}:`,
          errorMessage
        )

        hasErrors = true
        mintResults.push({
          assetId,
          amount: (group.totalPrice * tokenRate).toString(),
          error: errorMessage,
        })
      }
    }

    // Update database record
    if (hasErrors) {
      const errorMessages = mintResults
        .filter((r) => r.error)
        .map((r) => `Asset ${r.assetId}: ${r.error}`)
        .join("; ")

      await prisma.orderReward.update({
        where: {
          contractId_orderId: {
            contractId,
            orderId: confirmationId,
          },
        },
        data: {
          status: "failed",
          error: errorMessages,
          amount: totalMinted.toString(),
        },
      })

      return NextResponse.json(
        {
          error: "Some minting operations failed",
          results: mintResults,
          totalMinted: totalMinted.toString(),
        },
        { status: 500 }
      )
    } else {
      // All successful
      const txHashes = mintResults
        .map((r) => r.txHash)
        .filter((h): h is string => h !== undefined)

      await prisma.orderReward.update({
        where: {
          contractId_orderId: {
            contractId,
            orderId: confirmationId,
          },
        },
        data: {
          status: "success",
          txHash: txHashes.join(","), // Store all tx hashes comma-separated
          amount: totalMinted.toString(),
          error: null,
        },
      })

      return NextResponse.json({
        success: true,
        message: "Tokens minted successfully",
        orderId: confirmationId,
        totalTokens: totalMinted.toString(),
        results: mintResults,
        txHashes,
      })
    }
  } catch (error) {
    console.error("❌ [ORDER MINT] Error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

