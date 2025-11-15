'use client';

import { Check, Star, PartyPopper } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useWallet } from '@/components/wallet-provider';

export function TicketSection() {
  const { isConnected } = useWallet();

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
            isConnected 
              ? 'border-2 border-blue-500 glow-blue' 
              : 'border border-white/10'
          }`}>
            {isConnected && (
              <div className="absolute top-4 right-4">
                <div className="px-3 py-1 bg-pink-500/20 border border-pink-500 rounded-full flex items-center gap-1 animate-pulse-pink">
                  <PartyPopper className="w-4 h-4 text-pink-400" />
                  <span className="text-xs font-semibold text-pink-300">VIP UNLOCKED!</span>
                </div>
              </div>
            )}

            <h3 className="text-2xl font-bold text-white mb-2">Community VIP Pass</h3>
            <p className="text-white/60 mb-6">Premium festival experience</p>

            {isConnected && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-start gap-2">
                <Check className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-green-300">
                  Verified! We see you hold 100+ $BEAN tokens from 'Rosie's Roasters'.
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

            <Button className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold">
              Buy VIP Pass ($50.00)
            </Button>
          </Card>
        </div>
      </div>
    </section>
  );
}
