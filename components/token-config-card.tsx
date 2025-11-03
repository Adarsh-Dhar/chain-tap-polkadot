"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function TokenConfigCard() {
  const [tokenId, setTokenId] = useState("")
  const [tokensPerOrder, setTokensPerOrder] = useState("")
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
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

          <Button onClick={handleSave} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium mt-6">
            {saved ? "✓ Configuration Saved" : "Save Configuration"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
