"use client"

import PageHeader from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEffect, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"

type Contract = {
  id: number
  phalaEndpoint: string
  merchantName?: string | null
  assetId?: number | null
  tokensPerOrder?: number | null
  signerAddress?: string | null
}

export default function SettingsPage() {
  const { toast } = useToast()
  const [contractId, setContractId] = useState<number | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tokensPerOrder, setTokensPerOrder] = useState<number | "">("")

  useEffect(() => {
    const url = new URL(window.location.href)
    const cid = url.searchParams.get("contractId")
    let id: number | null = null
    if (cid) {
      const parsed = parseInt(cid, 10)
      id = isNaN(parsed) ? null : parsed
    } else {
      const stored = localStorage.getItem("contractId")
      if (stored) {
        const parsed = parseInt(stored, 10)
        id = isNaN(parsed) ? null : parsed
      }
    }
    if (!id) {
      setLoading(false)
      return
    }
    setContractId(id)
    ;(async () => {
      try {
        const res = await fetch(`/api/contracts/${id}`)
        if (!res.ok) throw new Error("Failed to load contract")
        const json = await res.json()
        setContract(json)
        setTokensPerOrder(typeof json.tokensPerOrder === "number" ? json.tokensPerOrder : "")
      } catch (e: any) {
        toast({ title: "Error", description: e?.message || "Failed to load" })
      } finally {
        setLoading(false)
      }
    })()
  }, [toast])

  const webhookUrl = useMemo(() => {
    if (!contractId) return ""
    return `${window.location.origin}/api/shopify/webhook/${contractId}`
  }, [contractId])

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl)
      toast({ title: "Copied webhook URL" })
    } catch {}
  }

  async function saveTokens() {
    if (!contractId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokensPerOrder: typeof tokensPerOrder === "number" ? tokensPerOrder : null }),
      })
      if (!res.ok) throw new Error("Save failed")
      const json = await res.json()
      setContract(json)
      toast({ title: "Saved" })
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Save failed" })
    } finally {
      setSaving(false)
    }
  }

  async function sendSample() {
    if (!contractId) return
    try {
      const sample = await fetch("/docs/sample-shopify-order.json").then((r) => r.json())
      const res = await fetch(`/api/shopify/webhook/${contractId}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shopify-topic": "orders/create",
        },
        body: JSON.stringify(sample),
      })
      toast({ title: res.ok ? "Sample sent" : "Failed", description: await res.text() })
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to send" })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader title="Settings" description="Configure your reward contract and webhook" />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>Webhook</CardTitle>
            <CardDescription>Paste this into Shopify → Settings → Notifications → Webhooks → Order creation</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : !contract ? (
              <div className="text-sm text-muted-foreground">No contract selected.</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-end">
                <div className="grid gap-2">
                  <Label>Webhook URL</Label>
                  <Input readOnly value={webhookUrl} />
                </div>
                <Button onClick={copyWebhook}>Copy</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>Token configuration</CardTitle>
            <CardDescription>Fixed tokens per order, asset, and signer</CardDescription>
          </CardHeader>
          <CardContent>
            {contract && (
              <div className="grid gap-6">
                <div className="grid gap-2 max-w-sm">
                  <Label htmlFor="tokens">Tokens per order</Label>
                  <Input
                    id="tokens"
                    type="number"
                    min={0}
                    value={tokensPerOrder}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      setTokensPerOrder(isNaN(v) ? "" : v)
                    }}
                  />
                  <div className="flex gap-3">
                    <Button onClick={saveTokens} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                    <Button variant="outline" onClick={sendSample}>Send sample webhook</Button>
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Asset ID</div>
                    <div className="font-mono">{contract.assetId ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Signer address</div>
                    <div className="font-mono break-all">{contract.signerAddress ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Forwarder URL</div>
                    <div className="font-mono break-all">{contract.phalaEndpoint}</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
