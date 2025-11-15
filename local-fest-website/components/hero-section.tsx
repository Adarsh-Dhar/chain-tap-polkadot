'use client';

import { Button } from '@/components/ui/button';
import { ArrowDown } from 'lucide-react';

export function HeroSection() {
  const scrollToTickets = () => {
    const ticketsSection = document.getElementById('tickets');
    ticketsSection?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative w-full h-screen flex items-center justify-center overflow-hidden">
      {/* Hero Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url('/crowd-at-a-concert-with-atmospheric-stage-lighting.jpg')`,
        }}
      />
      
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-3xl">
        <h1 className="text-6xl md:text-7xl font-bold mb-6 text-white leading-tight">
          <span className="bg-gradient-to-r from-blue-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
            SOUNDS OF THE COMMUNITY
          </span>
        </h1>
        
        <p className="text-xl md:text-2xl text-white/80 mb-8 text-pretty">
          A 3-Day Festival Celebrating Local Music & Local Fans.
        </p>

        <Button
          onClick={scrollToTickets}
          className="bg-blue-500 hover:bg-blue-600 text-white px-8 py-6 text-lg rounded-lg flex items-center gap-2 mx-auto transition-transform hover:scale-105"
        >
          Get Tickets
          <ArrowDown className="w-5 h-5" />
        </Button>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10 animate-bounce">
        <ArrowDown className="w-6 h-6 text-white/50" />
      </div>
    </section>
  );
}
