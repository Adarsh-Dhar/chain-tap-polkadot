"use client"

import PageHeader from "@/components/page-header"
import { ConnectWalletButton } from "@/components/connect-wallet-button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import { useToast } from "@/hooks/use-toast"
import { Check, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react"

type Contract = {
  id: number
  phalaEndpoint: string
  merchantName?: string | null
  assetId?: number | null
  tokensPerOrder?: number | null
  signerAddress?: string | null
  webhookUrl?: string | null
}

type FormState = {
  phalaEndpoint: string
  assetId: string
  tokensPerOrder: string
  webhookUrl: string
  signerAddress: string
}

const emptyForm: FormState = {
  phalaEndpoint: "",
  assetId: "",
  tokensPerOrder: "",
  webhookUrl: "",
  signerAddress: "",
}

export default function SettingsPage() {
  const { toast } = useToast()
  const [origin, setOrigin] = useState("")
  const [contractId, setContractId] = useState<number | null>(null)
  const [contract, setContract] = useState<Contract | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copyWebhookSuccess, setCopyWebhookSuccess] = useState(false)
  const [copyEndpointSuccess, setCopyEndpointSuccess] = useState(false)

  const applyContractToForm = useCallback((data: Contract | null) => {
    if (!data) {
      setForm(emptyForm)
      return
    }
    setForm({
      phalaEndpoint: data.phalaEndpoint ?? "",
      assetId: typeof data.assetId === "number" ? String(data.assetId) : "",
      tokensPerOrder: typeof data.tokensPerOrder === "number" ? String(data.tokensPerOrder) : "",
      webhookUrl: data.webhookUrl ?? "",
      signerAddress: data.signerAddress ?? "",
    })
  }, [])

  const fetchContract = useCallback(
    async (id: number) => {
      setLoading(true)
      try {
        const res = await fetch(`/api/contracts/${id}`)
        if (!res.ok) throw new Error("Unable to load contract")
        const json = (await res.json()) as Contract
        setContract(json)
        applyContractToForm(json)
      } catch (error: any) {
        toast({ title: "Failed to load", description: error?.message ?? "Unable to fetch contract" })
      } finally {
        setLoading(false)
      }
    },
    [applyContractToForm, toast]
  )

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    async function initialise() {
      if (typeof window === "undefined") return
      try {
        let id: number | null = null
        const url = new URL(window.location.href)
        const queryId = url.searchParams.get("contractId")
        if (queryId) {
          const parsed = parseInt(queryId, 10)
          if (!isNaN(parsed)) id = parsed
        }
        if (!id) {
          const stored = window.localStorage.getItem("contractId")
          if (stored) {
            const parsed = parseInt(stored, 10)
            if (!isNaN(parsed)) id = parsed
          }
        }
        if (!id) {
          const listRes = await fetch("/api/contracts")
          if (listRes.ok) {
            const list = await listRes.json()
            if (Array.isArray(list) && list.length > 0) {
              id = list[0].id
            }
          }
        }
        if (mounted) {
          setContractId(id)
        }
        if (id) {
          window.localStorage.setItem("contractId", String(id))
          await fetchContract(id)
        } else {
          setLoading(false)
        }
      } catch (error: any) {
        toast({ title: "Failed to detect contract", description: error?.message ?? "Please create a contract first" })
        setLoading(false)
      }
    }
    initialise()
    return () => {
      mounted = false
    }
  }, [fetchContract, toast])

  const webhookUrl = useMemo(() => {
    if (!contractId || !origin) return ""
    return `${origin}/api/shopify/webhook/${contractId}`
  }, [contractId, origin])

  const forwarderHealthUrl = useMemo(() => {
    if (!form.phalaEndpoint) return ""
    return `${form.phalaEndpoint.replace(/\/$/, "")}/balance`
  }, [form.phalaEndpoint])

  const handleCopy = useCallback((value: string, setter: (state: boolean) => void) => {
    if (!value) return
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setter(true)
        setTimeout(() => setter(false), 2000)
      })
      .catch(() => {
        toast({ title: "Copy failed", description: "Please copy manually." })
      })
  }, [toast])

  const handleChange = (key: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleRefresh = async () => {
    if (!contractId) return
    await fetchContract(contractId)
    toast({ title: "Refreshed", description: "Contract configuration reloaded" })
  }

  const handleSave = async () => {
    if (!contractId) return

    const payload: Record<string, unknown> = {}

    const endpointCandidate = form.phalaEndpoint.trim()
    if (!endpointCandidate.length) {
      toast({ title: "Forwarder URL required", description: "Enter the deployed Phat forwarder URL." })
      return
    }
    try {
      new URL(endpointCandidate)
      payload.phalaEndpoint = endpointCandidate
    } catch {
      toast({ title: "Invalid endpoint", description: "Enter a valid HTTPS URL for your Phat Forwarder." })
      return
    }

    if (form.webhookUrl.trim().length) {
      payload.webhookUrl = form.webhookUrl.trim()
    } else {
      payload.webhookUrl = ""
    }

    if (form.signerAddress.trim().length) {
      payload.signerAddress = form.signerAddress.trim()
    } else {
      payload.signerAddress = ""
    }

    const tokensValue = parseInt(form.tokensPerOrder, 10)
    if (!isNaN(tokensValue)) {
      payload.tokensPerOrder = tokensValue
    }

    const assetValue = parseInt(form.assetId, 10)
    if (!isNaN(assetValue)) {
      payload.assetId = assetValue
    }

    setSaving(true)
    console.info("Saving contract configuration", { contractId, payload })
    try {
      const res = await fetch(`/api/contracts/${contractId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || "Failed to save")
      }
      const updated = (await res.json()) as Contract
      setContract(updated)
      applyContractToForm(updated)
      toast({ title: "Configuration saved" })
      console.info("Contract configuration saved", { contractId, response: updated })
    } catch (error: any) {
      toast({ title: "Save failed", description: error?.message ?? "Unable to persist configuration" })
      console.error("Failed to save contract configuration", { contractId, error })
    } finally {
      setSaving(false)
    }
  }

  const sendSample = async () => {
    if (!contractId) return
    try {
      const sample = await fetch("/docs/sample-shopify-order.json").then((res) => res.json())
      const hmacRes = await fetch("/api/test/shopify-hmac", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sample),
      })
      if (!hmacRes.ok) {
        throw new Error(await hmacRes.text())
      }
      const { hmac } = (await hmacRes.json()) as { hmac?: string }
      if (!hmac) {
        throw new Error("Missing HMAC from signer")
      }
      const response = await fetch(`/api/shopify/webhook/${contractId}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-shopify-topic": "orders/create",
          "x-shopify-hmac-sha256": hmac,
          "x-minthook-debug": "true",
        },
        body: JSON.stringify(sample),
      })
      const raw = await response.text()
      let description = raw || ""
      try {
        const parsed = JSON.parse(raw) as { message?: string; attempts?: Array<{ target: string; status?: number; ok: boolean; source: string; error?: string; body?: string }> }
        const lines: string[] = []
        if (parsed.message) {
          lines.push(parsed.message)
        }
        if (parsed.attempts?.length) {
          parsed.attempts.forEach((attempt) => {
            const parts = [attempt.ok ? "✓" : "✗", attempt.source]
            if (attempt.status) parts.push(String(attempt.status))
            parts.push(attempt.target)
            if (attempt.error) parts.push(attempt.error)
            lines.push(parts.join(" · "))
          })
        }
        description = lines.filter(Boolean).join("\n") || description
      } catch {
        // keep raw description for non-JSON responses
        description = raw
      }
      toast({
        title: response.ok ? "Sample sent" : "Webhook failed",
        description:
          description || (response.ok ? "Forwarder accepted the order payload." : "Unknown error"),
      })
    } catch (error: any) {
      toast({ title: "Sample failed", description: error?.message ?? "Unable to send sample order" })
    }
  }

  const webhookCopyLabel = copyWebhookSuccess ? "Copied" : "Copy"
  const endpointCopyLabel = copyEndpointSuccess ? "Copied" : "Copy"

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary pb-16">
      <PageHeader 
        title="MintHook Settings" 
        description="Configure how Shopify orders bridge into your loyalty token."
        actions={<ConnectWalletButton />}
      />

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Your Connector Endpoint</CardTitle>
              <CardDescription>
                Paste this URL into Shopify → Settings → Notifications → Webhooks → Order creation.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading contract details…</div>
            ) : !contract ? (
              <div className="text-sm text-muted-foreground">No contract found. Create one from the API first.</div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="webhook-url">Webhook URL</Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input id="webhook-url" readOnly value={webhookUrl} className="font-mono text-xs" />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(webhookUrl, setCopyWebhookSuccess)}
                      className="gap-2"
                    >
                      {copyWebhookSuccess ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      {webhookCopyLabel}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Contract ID <code className="rounded bg-muted px-1 py-0.5">{contract.id}</code>
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="phala-endpoint">Phat Forwarder URL</Label>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      id="phala-endpoint"
                      placeholder="https://your-forwarder-url"
                      value={form.phalaEndpoint}
                      onChange={handleChange("phalaEndpoint")}
                      className="font-mono"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(form.phalaEndpoint, setCopyEndpointSuccess)}
                      className="gap-2"
                    >
                      {copyEndpointSuccess ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                      {endpointCopyLabel}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hosted forwarder URL currently used by the Phat contract bridge.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {forwarderHealthUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => window.open(forwarderHealthUrl, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4" /> Forwarder health
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={sendSample}>
                    <ExternalLink className="h-4 w-4" /> Send sample webhook
                  </Button>
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="text-xs text-muted-foreground">
            Need the forwarder deployed? Use the provided Docker image on Phala Cloud and copy the public URL here.
          </CardFooter>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>Reward Contract Configuration</CardTitle>
            <CardDescription>Update how many tokens mint per order and where the forwarder connects.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-3">
              <Label htmlFor="tokens-per-order">Tokens per Shopify order</Label>
              <Input
                id="tokens-per-order"
                type="number"
                min={0}
                placeholder="10"
                value={form.tokensPerOrder}
                onChange={handleChange("tokensPerOrder")}
              />
              <p className="text-xs text-muted-foreground">How many loyalty tokens each completed order receives.</p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="asset-id">Polkadot Asset Hub token ID</Label>
              <Input
                id="asset-id"
                type="number"
                min={0}
                placeholder="1234"
                value={form.assetId}
                onChange={handleChange("assetId")}
              />
              <p className="text-xs text-muted-foreground">Matches the asset minted by your Phat forwarder.</p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="webhook-alias">Webhook alias (optional)</Label>
              <Input
                id="webhook-alias"
                placeholder="https://api.minthook.com/webhook/rosie-roasters"
                value={form.webhookUrl}
                onChange={handleChange("webhookUrl")}
              />
              <p className="text-xs text-muted-foreground">Stored for reference—Shopify must still call the MintHook URL above.</p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="signer-address">Forwarder signer address</Label>
              <Input
                id="signer-address"
                placeholder="13a4...y7pX"
                value={form.signerAddress}
                onChange={handleChange("signerAddress")}
              />
              <p className="text-xs text-muted-foreground">Forwarder wallet that signs the mint (auto-filled after first run).</p>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Last deployed endpoint: {contract?.phalaEndpoint ? <code className="bg-muted px-1 py-0.5">{contract.phalaEndpoint}</code> : "—"}
            </div>
            <Button type="button" onClick={handleSave} disabled={saving || loading} className="min-w-[160px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save configuration"}
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-dashed hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Rosie’s Roasters · BEAN-Token Flow</CardTitle>
            <CardDescription>A real-world example of how MintHook rewards go from Shopify checkout to wallet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm leading-6">
            <div>
              <span className="font-semibold text-primary">1. Merchant setup.</span> Rosie logs into MintHook, creates the
              `BEAN-Token` (ID 1234), and copies the unique webhook URL displayed above into Shopify.
            </div>
            <div>
              <span className="font-semibold text-primary">2. Customer order.</span> Alice buys coffee and pastes her Polkadot
              wallet in the order notes during checkout.
            </div>
            <div>
              <span className="font-semibold text-primary">3. Shopify ping.</span> Shopify immediately posts the order JSON to
              MintHook’s `/api/shopify/webhook/{contractId}` endpoint.
            </div>
            <div>
              <span className="font-semibold text-primary">4. Phat translation.</span> The hosted forwarder extracts Alice’s
              wallet, sees Rosie’s rule of 10 tokens per order, and prepares the mint.
            </div>
            <div>
              <span className="font-semibold text-primary">5. Web3 execution.</span> The forwarder signs
              `Assets.mint(1234, Alice, 10)` on Polkadot Asset Hub.
            </div>
            <div>
              <span className="font-semibold text-primary">6. Instant reward.</span> Alice opens her wallet and finds 10
              BEAN-Tokens waiting—no manual steps required.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
