"use client"

import { useCallback, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

type LogEntry = {
  id: string
  action: string
  status: number | "error"
  response: string
  at: string
}

async function getServerHmac(body: string): Promise<string> {
  const res = await fetch("/api/test/shopify-hmac", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body || "{}",
  })
  if (!res.ok) throw new Error(`hmac_service_${res.status}`)
  const data = (await res.json()) as { hmac: string }
  return data.hmac
}

export default function TestPage() {
  const [topic, setTopic] = useState("orders/create")
  const [jsonBody, setJsonBody] = useState(
    JSON.stringify(
      {
        id: 123456,
        name: "#1001",
        email: "customer@example.com",
        total_price: "10.00",
      },
      null,
      2
    )
  )
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isSending, setIsSending] = useState(false)
  const logEndRef = useRef<HTMLDivElement | null>(null)

  const addLog = useCallback((entry: Omit<LogEntry, "id" | "at">) => {
    setLogs((prev) => [
      {
        id: crypto.randomUUID(),
        at: new Date().toLocaleTimeString(),
        ...entry,
      },
      ...prev,
    ])
  }, [])

  const bodyString = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(jsonBody))
    } catch {
      return jsonBody.trim()
    }
  }, [jsonBody])

  const sendRequest = useCallback(
    async (variant: "valid" | "noHmac" | "invalid" | "nonOrders") => {
      setIsSending(true)
      try {
        const endpoint = "/api/shopify/webhook"
        const headers: Record<string, string> = {
          "content-type": "application/json",
        }

        let usedTopic = topic
        if (variant === "nonOrders") usedTopic = "products/create"

        if (variant === "valid" || variant === "nonOrders") {
          headers["x-shopify-topic"] = usedTopic
          headers["x-shopify-hmac-sha256"] = await getServerHmac(bodyString)
        } else if (variant === "invalid") {
          headers["x-shopify-topic"] = usedTopic
          headers["x-shopify-hmac-sha256"] = "invalid_hmac_value"
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: bodyString || "{}",
        })
        const text = await res.text()
        addLog({ action: variant, status: res.status, response: text })
      } catch (err: unknown) {
        addLog({ action: "error", status: "error", response: (err as Error)?.message ?? "unknown_error" })
      } finally {
        setIsSending(false)
        // Scroll last log into view
        requestAnimationFrame(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }))
      }
    },
    [addLog, bodyString, topic]
  )

  return (
    <div className="container mx-auto max-w-4xl p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Test Endpoints</h1>
        <Badge variant="secondary">/api/shopify/webhook</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Shopify Webhook Tester</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="topic">Topic</Label>
              <Input
                id="topic"
                placeholder="orders/create"
                value={topic}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopic(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Change to test topics like products/create (expects 202 on server if HMAC valid).</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">JSON Body</Label>
            <Textarea
              id="body"
              rows={10}
              value={jsonBody}
              onChange={(e) => setJsonBody(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Raw string is used to compute HMAC. Must be valid JSON for server parse.</p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button disabled={isSending} onClick={() => sendRequest("valid")}>Send (valid HMAC)</Button>
          <Button disabled={isSending} variant="secondary" onClick={() => sendRequest("noHmac")}>Send (no HMAC)</Button>
          <Button disabled={isSending} variant="destructive" onClick={() => sendRequest("invalid")}>Send (invalid HMAC)</Button>
          <Button disabled={isSending} variant="outline" onClick={() => sendRequest("nonOrders")}>Send (non-orders topic)</Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logs</CardTitle>
        </CardHeader>
        <Separator />
        <CardContent>
          <div className="max-h-[320px] overflow-auto rounded-md border">
            <ul className="divide-y">
              {logs.length === 0 ? (
                <li className="p-4 text-sm text-muted-foreground">No logs yet. Trigger a request above.</li>
              ) : (
                logs.map((log) => (
                  <li key={log.id} className="p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{log.action}</div>
                      <div className="flex items-center gap-2">
                        <Badge variant={log.status === 200 || log.status === 202 ? "default" : log.status === "error" ? "destructive" : "secondary"}>
                          {String(log.status)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{log.at}</span>
                      </div>
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{log.response}</pre>
                  </li>
                ))
              )}
            </ul>
            <div ref={logEndRef} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


