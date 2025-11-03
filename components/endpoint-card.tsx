"use client"

import { Copy, Check } from "lucide-react"
import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const WEBHOOK_URL = "https://api.connector.network/webhook/a1b2-c3d4-e5f6-g7h8"

export default function EndpointCard() {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(WEBHOOK_URL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-semibold text-sm">
                1
              </span>
              <CardTitle className="text-xl">Your Connector Endpoint</CardTitle>
            </div>
            <CardDescription className="mt-2">
              Copy this unique webhook URL and paste it into your Shopify admin panel under &apos;Notifications &gt;
              Webhooks&apos; for the &apos;Order creation&apos; event.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            type="text"
            value={WEBHOOK_URL}
            readOnly
            className="font-mono text-sm bg-gray-50 border-gray-200 text-gray-600"
          />
          <Button
            onClick={handleCopy}
            variant="outline"
            size="sm"
            className="border-gray-200 hover:bg-gray-50 bg-transparent"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
