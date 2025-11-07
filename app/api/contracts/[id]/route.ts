import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const contractId = parseInt(id, 10)
    if (isNaN(contractId)) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 })
    }

    const contract = await prisma.contract.findUnique({ where: { id: contractId } })
    if (!contract) {
      return NextResponse.json({ error: "not found" }, { status: 404 })
    }
    return NextResponse.json(contract)
  } catch (error) {
    console.error("Error fetching contract:", error)
    return NextResponse.json({ error: "Failed to fetch contract" }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const contractId = parseInt(id, 10)
    if (isNaN(contractId)) {
      return NextResponse.json({ error: "invalid id" }, { status: 400 })
    }

    const body = await req.json()
    const update: any = {}
    if (typeof body.tokensPerOrder === "number") update.tokensPerOrder = body.tokensPerOrder
    if (typeof body.assetId === "number") update.assetId = body.assetId
    if (typeof body.webhookUrl === "string") update.webhookUrl = body.webhookUrl
    if (typeof body.signerAddress === "string") update.signerAddress = body.signerAddress
    if (typeof body.phalaEndpoint === "string") {
      const trimmed = body.phalaEndpoint.trim()
      if (trimmed.length) {
        try {
          const parsed = new URL(trimmed)
          const normalized = parsed.toString().replace(/\/$/, "")
          update.phalaEndpoint = normalized
        } catch (error) {
          return NextResponse.json({ error: "invalid phalaEndpoint" }, { status: 400 })
        }
      } else {
        update.phalaEndpoint = ""
      }
    }

    const updated = await prisma.contract.update({ where: { id: contractId }, data: update })
    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating contract:", error)
    return NextResponse.json({ error: "Failed to update contract" }, { status: 500 })
  }
}


