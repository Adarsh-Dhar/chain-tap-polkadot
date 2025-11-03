"use client"

import PageHeader from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

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
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader title="Integrations" description="Connect and manage your external services" />

      <div className="max-w-7xl mx-auto px-6 py-8">
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
