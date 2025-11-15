'use client';

import { Header } from '@/components/header';
import { HeroSection } from '@/components/hero-section';
import { TicketSection } from '@/components/ticket-section';
import { HowItWorks } from '@/components/how-it-works';
import { ArtistLineup } from '@/components/artist-lineup';
import { Footer } from '@/components/footer';

export default function Home() {
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
