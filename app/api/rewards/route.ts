import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const contractId = parseInt(searchParams.get("contractId") || "", 10)
  if (isNaN(contractId)) {
    return NextResponse.json({ error: "contractId required" }, { status: 400 })
  }
  const rewards = await prisma.orderReward.findMany({
    where: { contractId },
    orderBy: { id: "desc" },
    take: 100,
  })
  return NextResponse.json(rewards)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { contractId, orderId, wallet, amount, assetId, status, txHash, error } = body
    if (!contractId || !orderId) {
      return NextResponse.json({ error: "contractId and orderId required" }, { status: 400 })
    }
    const reward = await prisma.orderReward.upsert({
      where: { contractId_orderId: { contractId, orderId } },
      create: { contractId, orderId, wallet: wallet || null, amount: amount || null, assetId: assetId || null, status: status || "pending", txHash: txHash || null, error: error || null },
      update: { wallet: wallet || undefined, amount: amount || undefined, assetId: assetId || undefined, status: status || undefined, txHash: txHash || undefined, error: error || undefined },
    })
    return NextResponse.json(reward)
  } catch (e) {
    console.error("rewards upsert error", e)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
}


