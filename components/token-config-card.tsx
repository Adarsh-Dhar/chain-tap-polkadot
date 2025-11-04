"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function TokenConfigCard() {
  const [tokenId, setTokenId] = useState("")
  const [tokensPerOrder, setTokensPerOrder] = useState("")
  const [saved, setSaved] = useState(false)
  const [contractId, setContractId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = await fetch("/api/contracts")
        const list = await res.json()
        if (!mounted) return
        if (Array.isArray(list) && list.length > 0) {
          const c = list[0]
          setContractId(c.id)
          if (typeof c.assetId === "number") setTokenId(String(c.assetId))
          if (typeof c.tokensPerOrder === "number") setTokensPerOrder(String(c.tokensPerOrder))
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [])

  const handleSave = async () => {
    if (!contractId) return
    const payload: any = {}
    if (tokenId) payload.assetId = parseInt(tokenId, 10)
    if (tokensPerOrder) payload.tokensPerOrder = parseInt(tokensPerOrder, 10)
    await fetch(`/api/contracts/${contractId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-600 font-semibold text-sm">
            2
          </span>
          <CardTitle className="text-xl">Token Configuration</CardTitle>
        </div>
        <CardDescription className="mt-2">
          Configure your Polkadot Asset Hub token settings for automatic minting
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading configuration...</div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="token-id" className="text-sm font-medium text-gray-700">
              Polkadot Asset Hub Token ID
            </Label>
            <Input
              id="token-id"
              placeholder="e.g., 1234"
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              className="border-gray-200 bg-white"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tokens-per-order" className="text-sm font-medium text-gray-700">
              Tokens to Mint Per Order
            </Label>
            <Input
              id="tokens-per-order"
              type="number"
              placeholder="e.g., 100"
              value={tokensPerOrder}
              onChange={(e) => setTokensPerOrder(e.target.value)}
              className="border-gray-200 bg-white"
            />
          </div>

          <Button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium mt-6" disabled={!contractId}>
            {saved ? "✓ Configuration Saved" : "Save Configuration"}
          </Button>
          {contractId ? (
            <div className="text-xs text-muted-foreground">Contract ID: <code className="bg-gray-100 px-1 rounded">{contractId}</code></div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
