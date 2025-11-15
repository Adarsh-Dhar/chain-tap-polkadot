'use client';

import { useState } from 'react';
import { Wallet, CheckCircle, Star, Music, ChevronDown, Copy, Check, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useWallet } from '@/components/wallet-provider';
import { useToast } from '@/hooks/use-toast';
import { useVipAccess } from '@/hooks/use-vip-access';
import { cn } from '@/lib/utils';

function truncateAddress(address: string, start = 6, end = 4): string {
  if (address.length <= start + end) return address;
  return `${address.slice(0, start)}...${address.slice(-end)}`;
}

interface HeaderProps {
  onWalletConnect?: () => void;
}

export function Header({ onWalletConnect }: HeaderProps) {
  const { selectedAccount, accounts, isConnected, isConnecting, connect, disconnect, selectAccount } = useWallet();
  const { toast } = useToast();
  const { hasVipAccess } = useVipAccess();
  const [copied, setCopied] = useState(false);

  const handleConnect = async () => {
    try {
      const connectedAccount = await connect();
      onWalletConnect?.();
      toast({
        title: 'Wallet connected',
        description: `Connected to ${connectedAccount.meta.name || 'wallet'}`,
      });
    } catch (error: any) {
      toast({
        title: 'Connection failed',
        description: error?.message || 'Failed to connect to wallet',
        variant: 'destructive',
      });
    }
  };

  const handleDisconnect = () => {
    disconnect();
    toast({
      title: 'Wallet disconnected',
      description: 'You have been disconnected from your wallet',
    });
  };

  const handleCopyAddress = async () => {
    if (!selectedAccount) return;

    try {
      await navigator.clipboard.writeText(selectedAccount.address);
      setCopied(true);
      toast({
        title: 'Address copied',
        description: 'Wallet address copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy address to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleSelectAccount = (account: typeof accounts[0]) => {
    selectAccount(account);
    toast({
      title: 'Account switched',
      description: `Switched to ${account.meta.name || 'account'}`,
    });
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-black/40 backdrop-blur-md border-b border-white/10">
      <nav className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Music className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-white">LOCAL MUSIC FEST</span>
        </div>

        {/* Center Navigation */}
        <div className="hidden md:flex gap-8">
          <a href="#lineup" className="text-white/70 hover:text-white transition">Lineup</a>
          <a href="#tickets" className="text-white/70 hover:text-white transition">Tickets</a>
          <a href="#partners" className="text-white/70 hover:text-white transition">Partners</a>
        </div>

        {/* Right Side - Wallet Button */}
        {!isConnected ? (
            <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className="bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-2"
          >
            <Wallet className="w-4 h-4" />
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </Button>
        ) : selectedAccount ? (
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-full flex items-center gap-2 hover:bg-green-500/20 transition cursor-pointer">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-400">
                    Wallet Connected: {truncateAddress(selectedAccount.address)}
                  </span>
                  <ChevronDown className="w-3 h-3 text-green-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 bg-black/90 border-white/10">
                <DropdownMenuLabel className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-white">{selectedAccount.meta.name || 'Account'}</span>
                  <span className="text-xs text-white/60 font-mono">
                    {selectedAccount.address}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={handleCopyAddress} className="gap-2 text-white hover:bg-white/10">
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
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuLabel className="text-white/70">Switch account</DropdownMenuLabel>
                    {accounts.map((account) => (
                      <DropdownMenuItem
                        key={account.address}
                        onClick={() => handleSelectAccount(account)}
                        className={cn(
                          'gap-2 text-white hover:bg-white/10',
                          account.address === selectedAccount.address && 'bg-white/10'
                        )}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm">{account.meta.name || 'Account'}</span>
                          <span className="text-xs text-white/60 font-mono">
                            {truncateAddress(account.address, 4, 4)}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={handleDisconnect} className="gap-2 text-red-400 hover:bg-red-500/10">
                  <LogOut className="size-4" />
                  <span>Disconnect</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {hasVipAccess && (
              <div className="px-3 py-2 bg-pink-500/20 border border-pink-500/40 rounded-full flex items-center gap-1 animate-pulse-pink">
                <Star className="w-4 h-4 text-pink-400" />
                <span className="text-xs font-semibold text-pink-300">VIP STATUS: ACTIVE</span>
              </div>
            )}
          </div>
        ) : null}
      </nav>
    </header>
  );
}
