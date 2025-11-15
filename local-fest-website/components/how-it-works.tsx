'use client';

import { ShoppingCart, Wallet, KeyRound } from 'lucide-react';

const steps = [
  {
    icon: ShoppingCart,
    number: 1,
    title: 'Shop at Partner Stores',
    description: 'You shop at local partners like "Rosie\'s Roasters" and, as a reward, you earn their loyalty tokens (like $BEAN) in your personal Polkadot wallet.',
  },
  {
    icon: Wallet,
    number: 2,
    title: 'Connect Your Wallet',
    description: 'You connect your secure Polkadot wallet to our site. We never ask for your keys or personal data. We only read your public token balance.',
  },
  {
    icon: KeyRound,
    number: 3,
    title: 'Unlock Perks Instantly',
    description: 'Our site instantly verifies you hold the partner token, and your discount is unlocked. No coupon codes. No signups. Your token is your digital key.',
  },
];

export function HowItWorks() {
  return (
    <section id="partners" className="py-20 px-4 bg-card/50">
      <div className="max-w-6xl mx-auto">
        {/* Section Title */}
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-white mb-4">What is a Community Pass?</h2>
          <p className="text-white/60">How your loyalty tokens unlock exclusive benefits</p>
        </div>

        {/* Steps Grid */}
        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="relative p-8 bg-background border border-white/10 rounded-xl hover:border-blue-500/50 transition-all group"
              >
                {/* Number Circle */}
                <div className="absolute -top-6 -left-6 w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center font-bold text-white text-lg">
                  {step.number}
                </div>

                {/* Icon */}
                <div className="mb-6 w-16 h-16 bg-pink-500/10 rounded-lg flex items-center justify-center group-hover:bg-pink-500/20 transition">
                  <Icon className="w-8 h-8 text-pink-400" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-white mb-3">{step.title}</h3>
                <p className="text-white/60 leading-relaxed">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
