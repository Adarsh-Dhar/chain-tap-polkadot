import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST: Direct token transfer endpoint (for marketplace purchases)
// Note: This uses the forwarder's wallet, so it requires the seller to have
// pre-authorized transfers or we need an escrow system
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { fromAddress, toAddress, assetId, amount, transactionId } = body

    if (!fromAddress || !toAddress || !assetId || !amount) {
      return NextResponse.json(
        { error: "Missing required fields: fromAddress, toAddress, assetId, amount" },
        { status: 400 }
      )
    }

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

    // Get contract for forwarder endpoint
    const contracts = await prisma.contract.findMany({
      orderBy: { id: "asc" },
      take: 1,
    })

    if (contracts.length === 0) {
      return NextResponse.json(
        { error: "No contract found" },
        { status: 400 }
      )
    }

    const contract = contracts[0]
    const phalaEndpoint = contract.phalaEndpoint || process.env.PHAT_ENDPOINT_URL
    const forwardToken = process.env.PHAT_FORWARD_TOKEN || ""

    if (!phalaEndpoint || !forwardToken) {
      return NextResponse.json(
        { error: "Phala endpoint or forward token not configured" },
        { status: 500 }
      )
    }

    const endpoint = phalaEndpoint.replace(/\/$/, "")

    // Check sender balance
    const balanceUrl = `${endpoint}/asset/${assetId}/balance/${fromAddress}`
    const balanceResponse = await fetch(balanceUrl, {
      method: "GET",
      headers: {
        "x-forward-token": forwardToken,
      },
    })

    if (!balanceResponse.ok) {
      const errorData = await balanceResponse.json().catch(() => ({}))
      return NextResponse.json(
        { error: errorData.message || errorData.error || "Failed to check balance" },
        { status: balanceResponse.status }
      )
    }

    const balanceData = await balanceResponse.json()
    const availableBalance = parseFloat(balanceData.balanceFormatted || balanceData.balance || "0")
    const transferAmount = parseFloat(amount)

    if (availableBalance < transferAmount) {
      return NextResponse.json(
        { error: `Insufficient balance. Available: ${availableBalance}, Requested: ${transferAmount}` },
        { status: 400 }
      )
    }

    // Note: Actual transfer would require the sender's wallet signature
    // For now, this is a placeholder that validates the transfer
    // In a production system, you would:
    // 1. Use wallet extensions for user-signed transactions
    // 2. Implement an escrow system where tokens are held by the marketplace
    // 3. Use a smart contract for atomic swaps

    // If transactionId is provided, update the transaction record
    if (transactionId) {
      try {
        const marketTransactionModel = (prisma as any).marketTransaction
        if (marketTransactionModel) {
          await marketTransactionModel.update({
            where: { id: parseInt(transactionId, 10) },
            data: {
              status: "completed",
              // txHash would be set here after actual blockchain transaction
            },
          })
        }
      } catch (updateError) {
        console.error("Error updating transaction:", updateError)
      }
    }

    return NextResponse.json({
      success: true,
      message: "Transfer validated. Actual blockchain transfer needs to be implemented.",
      fromAddress,
      toAddress,
      assetId,
      amount: transferAmount,
      note: "This endpoint validates transfers. Actual blockchain transactions require wallet signatures or escrow system.",
    }, { status: 200 })
  } catch (error) {
    console.error("Error processing transfer:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process transfer" },
      { status: 500 }
    )
  }
}

