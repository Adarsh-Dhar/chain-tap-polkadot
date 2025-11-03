"use client"

import PageHeader from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useEffect, useMemo, useState } from "react"

const integrations = [
  {
    name: "Shopify",
    description: "Connect your Shopify store",
    status: "connected",
    icon: "🛍️",
  },
  {
    name: "Polkadot",
    description: "Web3 blockchain integration",
    status: "connected",
    icon: "⛓️",
  },
  {
    name: "Discord",
    description: "Send rewards notifications",
    status: "pending",
    icon: "💬",
  },
  {
    name: "Email Service",
    description: "Customer communications",
    status: "available",
    icon: "📧",
  },
]

export default function IntegrationsPage() {
  const [origin, setOrigin] = useState("")
  const [contractId, setContractId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin)
      
      // Try to get contract ID from localStorage (set by admin)
      const storedId = localStorage.getItem("contractId")
      if (storedId) {
        const id = parseInt(storedId, 10)
        if (!isNaN(id)) {
          setContractId(id)
          setLoading(false)
          return
        }
      }
      
      // Otherwise, fetch from API
      fetch("/api/contracts")
        .then((res) => res.json())
        .then((contracts) => {
          if (Array.isArray(contracts) && contracts.length > 0) {
            setContractId(contracts[0].id)
            localStorage.setItem("contractId", String(contracts[0].id))
          }
          setLoading(false)
        })
        .catch(() => {
          setLoading(false)
        })
    }
  }, [])

  const webhookUrl = useMemo(() => {
    if (!contractId || !origin) return "/api/shopify/webhook"
    return `${origin}/api/shopify/webhook/${contractId}`
  }, [contractId, origin])

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl)
    } catch {}
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader title="Integrations" description="Connect and manage your external services" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <Card className="hover:shadow-lg transition-shadow mb-8">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Shopify Webhook</CardTitle>
                <CardDescription>Receive orders/create events and forward to your Phat Contract</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-sm text-muted-foreground">Loading webhook URL...</div>
            ) : contractId ? (
              <>
                <div className="grid gap-4 sm:grid-cols-[1fr_auto] items-center">
                  <div className="space-y-2">
                    <div className="text-sm text-muted-foreground">Webhook URL</div>
                    <Input readOnly value={webhookUrl} />
                  </div>
                  <div className="pt-6 sm:pt-0">
                    <Button onClick={copyWebhook} className="w-full sm:w-auto">Copy URL</Button>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-4">
                  Contract ID: <code className="bg-gray-100 px-1 rounded">{contractId}</code>
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Configure in Shopify: Settings → Notifications → Webhooks → Create → Event: Order creation → URL above → JSON.
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                No contract found. Please contact admin to set up your webhook URL.
              </div>
            )}
          </CardContent>
        </Card>
        <div className="grid gap-6 md:grid-cols-2">
          {integrations.map((integration) => (
            <Card key={integration.name} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-3xl">{integration.icon}</div>
                    <div>
                      <CardTitle>{integration.name}</CardTitle>
                      <CardDescription>{integration.description}</CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={
                      integration.status === "connected"
                        ? "default"
                        : integration.status === "pending"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {integration.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Button variant={integration.status === "connected" ? "outline" : "default"} className="w-full">
                  {integration.status === "connected" ? "Manage" : "Connect"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
