"use client"

import PageHeader from "@/components/page-header"
import { ConnectWalletButton } from "@/components/connect-wallet-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"

export default function IntegrationsPage() {
  const { toast } = useToast()
  const [merchantName, setMerchantName] = useState("")
  const [phalaEndpoint, setPhalaEndpoint] = useState("")
  const [tokensPerOrder, setTokensPerOrder] = useState<number | "">(10)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!phalaEndpoint) {
      toast({ title: "Forwarder URL required", description: "Enter your Phat/forwarder URL" })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phalaEndpoint,
          merchantName: merchantName || null,
          tokensPerOrder: typeof tokensPerOrder === "number" ? tokensPerOrder : null,
        }),
      })
      if (!res.ok) {
        toast({ title: "Failed to create contract", description: "Please check your inputs" })
        return
      }
      const json = await res.json()
      toast({ title: "Contract created", description: `ID ${json.id}` })
      if (typeof window !== "undefined") {
        localStorage.setItem("contractId", String(json.id))
        window.location.href = `/settings?contractId=${json.id}`
      }
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Unexpected error" })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader 
        title="Integrations" 
        description="Create a reward contract and connect Shopify"
        actions={<ConnectWalletButton />}
      />

      <div className="max-w-3xl mx-auto px-6 py-8">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>New Reward Contract</CardTitle>
            <CardDescription>Define your forwarder URL and tokens per order</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="merchantName">Merchant name</Label>
                  <Input id="merchantName" placeholder="Rosie's Roasters" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phalaEndpoint">Forwarder URL</Label>
                  <Input id="phalaEndpoint" placeholder="https://forwarder.example.com/forward-order" value={phalaEndpoint} onChange={(e) => setPhalaEndpoint(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="tokensPerOrder">Tokens per order</Label>
                  <Input id="tokensPerOrder" type="number" min={0} value={tokensPerOrder} onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    setTokensPerOrder(isNaN(v) ? "" : v)
                  }} />
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="submit" disabled={submitting}>{submitting ? "Creating..." : "Create Contract"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
