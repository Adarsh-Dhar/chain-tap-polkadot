"use client"

import PageHeader from "@/components/page-header"
import { ConnectWalletButton } from "@/components/connect-wallet-button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const teamMembers = [
  {
    name: "Emma Wilson",
    role: "Admin",
    email: "emma@chaintap.io",
    status: "active",
  },
  {
    name: "James Chen",
    role: "Manager",
    email: "james@chaintap.io",
    status: "active",
  },
  {
    name: "Sofia Rodriguez",
    role: "Analyst",
    email: "sofia@chaintap.io",
    status: "active",
  },
]

export default function TeamPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      <PageHeader 
        title="Team" 
        description="Manage team members and permissions"
        actions={<ConnectWalletButton />}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex justify-end mb-6">
          <Button>Add Team Member</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {teamMembers.map((member) => (
                <div
                  key={member.email}
                  className="flex items-center justify-between p-4 border border-border rounded-lg"
                >
                  <div>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-sm text-muted-foreground">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{member.role}</Badge>
                    <Badge variant="secondary">{member.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
