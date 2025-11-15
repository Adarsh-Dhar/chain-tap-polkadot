'use client';

import { useEffect } from 'react';
import { Header } from '@/components/header';
import { HeroSection } from '@/components/hero-section';
import { TicketSection } from '@/components/ticket-section';
import { HowItWorks } from '@/components/how-it-works';
import { ArtistLineup } from '@/components/artist-lineup';
import { Footer } from '@/components/footer';
import { useVipAccess, VIP_TOKEN_THRESHOLD } from '@/hooks/use-vip-access';

export default function Home() {
  const { tokenBalance, tokenBalanceFormatted, loading } = useVipAccess();

  useEffect(() => {
    if (!loading) {
      console.log('VIP Access Status:', {
        requiredTokens: VIP_TOKEN_THRESHOLD,
        userTokenBalance: tokenBalance,
        userTokenBalanceFormatted: tokenBalanceFormatted,
      });
    }
  }, [loading, tokenBalance, tokenBalanceFormatted]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Header />
      <HeroSection />
      <TicketSection />
      <HowItWorks />
      <ArtistLineup />
      <Footer />
    </main>
  );
}
