'use client';

import { Check, Star, PartyPopper, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useWallet } from '@/components/wallet-provider';
import { useToast } from '@/hooks/use-toast';
import { useVipAccess } from '@/hooks/use-vip-access';

export function TicketSection() {
  const { isConnected } = useWallet();
  const { toast } = useToast();
  const { hasVipAccess, tokenBalanceFormatted, loading: vipLoading, tokenTitle } = useVipAccess();

  return (
    <section id="tickets" className="py-20 px-4 bg-background">
      <div className="max-w-6xl mx-auto">
        {/* Section Title */}
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-white mb-4">Get Your Passes</h2>
          <p className="text-white/60">Choose the perfect experience for your festival</p>
        </div>

        {/* Pricing Grid */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* General Admission Card */}
          <Card className="bg-card border border-white/10 p-8 rounded-xl hover:border-white/20 transition">
            <h3 className="text-2xl font-bold text-white mb-2">General Admission</h3>
            <p className="text-white/60 mb-6">Full festival experience</p>
            
            <div className="mb-6">
              <span className="text-4xl font-bold text-white">$75</span>
              <span className="text-white/60 ml-2">.00</span>
            </div>

            <ul className="space-y-3 mb-8">
              {['3-Day Access', 'Main Stage Access', 'Food Court Access'].map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-white/70">
                  <Check className="w-5 h-5 text-blue-400" />
                  {feature}
                </li>
              ))}
            </ul>

            <Button className="w-full bg-white/10 hover:bg-white/20 text-white border border-white/20">
              Buy GA Pass
            </Button>
          </Card>

          {/* VIP Pass Card */}
          <Card className={`bg-card p-8 rounded-xl relative transition-all ${
            hasVipAccess 
              ? 'border-2 border-blue-500 glow-blue' 
              : 'border border-white/10'
          }`}>
            {hasVipAccess && (
              <div className="absolute top-4 right-4">
                <div className="px-3 py-1 bg-pink-500/20 border border-pink-500 rounded-full flex items-center gap-1 animate-pulse-pink">
                  <PartyPopper className="w-4 h-4 text-pink-400" />
                  <span className="text-xs font-semibold text-pink-300">VIP UNLOCKED!</span>
                </div>
              </div>
            )}

            <h3 className="text-2xl font-bold text-white mb-2">Community VIP Pass</h3>
            <p className="text-white/60 mb-6">Premium festival experience</p>

            {vipLoading && isConnected && (
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                <p className="text-sm text-blue-300">
                  Checking token ownership...
                </p>
              </div>
            )}

            {!vipLoading && hasVipAccess && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-2">
                <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-green-300">
                  Verified! You hold {tokenBalanceFormatted} tokens from {tokenTitle || 'Rosie\'s Roasters'}.
                </p>
              </div>
            )}

            {!vipLoading && isConnected && !hasVipAccess && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
                <Star className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-yellow-300">
                  Connect your wallet and hold 100+ tokens from Rosie's Roasters to unlock VIP access.
                </p>
              </div>
            )}

            <div className="mb-6">
              <span className="text-white/50 line-through">$75.00</span>
              <div className="mt-2">
                <span className="text-4xl font-bold text-blue-400">$50</span>
                <span className="text-blue-400 ml-2">.00</span>
              </div>
            </div>

            <ul className="space-y-3 mb-8">
              {['All GA Perks', '+ VIP Lounge Access', '+ 1 Free Drink'].map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-white/70">
                  <Check className="w-5 h-5 text-pink-400" />
                  {feature}
                </li>
              ))}
            </ul>

            <Button 
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold"
              onClick={() => {
                // Show alert when VIP pass is used to buy a product
                toast({
                  title: '🎉 VIP Pass Purchase!',
                  description: 'Thank you for purchasing with your VIP Pass! You\'ve unlocked exclusive benefits.',
                  variant: 'default',
                });
              }}
            >
              Buy VIP Pass ($50.00)
            </Button>
          </Card>
        </div>
      </div>
    </section>
  );
}
