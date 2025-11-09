"use client"

import React from 'react'
import { Wallet, LogOut, ChevronDown, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useWallet } from '@/components/wallet-provider'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

function truncateAddress(address: string, start = 6, end = 4): string {
  if (address.length <= start + end) return address
  return `${address.slice(0, start)}...${address.slice(-end)}`
}

export function ConnectWalletButton() {
  const { selectedAccount, accounts, isConnected, isConnecting, connect, disconnect, selectAccount } = useWallet()
  const { toast } = useToast()
  const [copied, setCopied] = React.useState(false)

  const handleConnect = async () => {
    try {
      const connectedAccount = await connect()
      toast({
        title: 'Wallet connected',
        description: `Connected to ${connectedAccount.meta.name || 'wallet'}`,
      })
    } catch (error: any) {
      toast({
        title: 'Connection failed',
        description: error?.message || 'Failed to connect to wallet',
        variant: 'destructive',
      })
    }
  }

  const handleDisconnect = () => {
    disconnect()
    toast({
      title: 'Wallet disconnected',
      description: 'You have been disconnected from your wallet',
    })
  }

  const handleCopyAddress = async () => {
    if (!selectedAccount) return

    try {
      await navigator.clipboard.writeText(selectedAccount.address)
      setCopied(true)
      toast({
        title: 'Address copied',
        description: 'Wallet address copied to clipboard',
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy address to clipboard',
        variant: 'destructive',
      })
    }
  }

  const handleSelectAccount = (account: typeof accounts[0]) => {
    selectAccount(account)
    toast({
      title: 'Account switched',
      description: `Switched to ${account.meta.name || 'account'}`,
    })
  }

  if (!isConnected) {
    return (
      <Button
        onClick={handleConnect}
        disabled={isConnecting}
        className="gap-2"
      >
        <Wallet className="size-4" />
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </Button>
    )
  }

  if (!selectedAccount) {
    return null
  }

  const accountName = selectedAccount.meta.name || 'Account'
  const accountAddress = selectedAccount.address
  const truncatedAddress = truncateAddress(accountAddress)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Avatar className="size-5">
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {accountName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="hidden sm:inline-block">{accountName}</span>
          <span className="text-muted-foreground hidden md:inline-block">
            ({truncatedAddress})
          </span>
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-1">
          <span className="text-sm font-medium">{accountName}</span>
          <span className="text-xs text-muted-foreground font-mono">
            {accountAddress}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyAddress} className="gap-2">
          {copied ? (
            <>
              <Check className="size-4" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="size-4" />
              <span>Copy address</span>
            </>
          )}
        </DropdownMenuItem>
        {accounts.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Switch account</DropdownMenuLabel>
            {accounts.map((account) => (
              <DropdownMenuItem
                key={account.address}
                onClick={() => handleSelectAccount(account)}
                className={cn(
                  'gap-2',
                  account.address === selectedAccount.address && 'bg-accent'
                )}
              >
                <Avatar className="size-4">
                  <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                    {(account.meta.name || 'Account').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm">{account.meta.name || 'Account'}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {truncateAddress(account.address, 4, 4)}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDisconnect} variant="destructive" className="gap-2">
          <LogOut className="size-4" />
          <span>Disconnect</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

