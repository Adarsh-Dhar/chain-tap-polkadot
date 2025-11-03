"use client"

import PageHeader from "@/components/page-header"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const settings = [
  {
    title: "API Keys",
    description: "Manage your API credentials",
    button: "View Keys",
  },
  {
    title: "Notifications",
    description: "Configure alert and notification preferences",
    button: "Configure",
  },
  {
    title: "Security",
    description: "Set up two-factor authentication and security settings",
    button: "Secure",
  },
  {
    title: "Billing",
    description: "Manage your subscription and billing information",
    button: "Manage",
  },
]

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader title="Settings" description="Manage your ChainTap account and preferences" />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="space-y-4">
          {settings.map((setting) => (
            <Card key={setting.title} className="hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle>{setting.title}</CardTitle>
                  <CardDescription>{setting.description}</CardDescription>
                </div>
                <Button variant="outline">{setting.button}</Button>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
