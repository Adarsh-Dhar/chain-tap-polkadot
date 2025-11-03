"use client"

import { Copy, Check } from "lucide-react"
import { useState, useEffect, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface EndpointCardProps {
  contractId?: number
}

export default function EndpointCard({ contractId: propContractId }: EndpointCardProps) {
  const [copied, setCopied] = useState(false)
  const [contractId, setContractId] = useState<number | null>(propContractId || null)
  const [origin, setOrigin] = useState("")
  const [loading, setLoading] = useState(!propContractId)

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin)
      
      // If contract ID not provided as prop, try to fetch from API
      if (!propContractId) {
        // Try to get from localStorage first (set by admin)
        const storedId = localStorage.getItem("contractId")
        if (storedId) {
          const id = parseInt(storedId, 10)
          if (!isNaN(id)) {
            setContractId(id)
            setLoading(false)
            return
          }
        }
        
        // Otherwise, fetch from API (get first contract or specific one)
        fetch("/api/contracts")
          .then((res) => res.json())
          .then((contracts) => {
            if (Array.isArray(contracts) && contracts.length > 0) {
              // Use the first contract (or you could implement logic to get the user's contract)
              setContractId(contracts[0].id)
              localStorage.setItem("contractId", String(contracts[0].id))
            }
            setLoading(false)
          })
          .catch(() => {
            setLoading(false)
          })
      }
    }
  }, [propContractId])

  const webhookUrl = useMemo(() => {
    if (!contractId || !origin) return ""
    return `${origin}/api/shopify/webhook/${contractId}`
  }, [contractId, origin])

  const handleCopy = () => {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
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
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading webhook URL...</div>
        ) : contractId ? (
          <>
            <div className="flex gap-2">
              <Input
                type="text"
                value={webhookUrl}
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
            <div className="text-xs text-muted-foreground">
              Contract ID: <code className="bg-gray-100 px-1 rounded">{contractId}</code>
            </div>
          </>
        ) : (
          <div className="text-sm text-muted-foreground">
            No contract found. Please contact admin to set up your webhook URL.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
