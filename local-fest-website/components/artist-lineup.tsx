'use client';

const artists = [
  { id: 1, name: 'Luna Echo', image: '/placeholder.svg?key=0u6fb' },
  { id: 2, name: 'The Resonants', image: '/placeholder.svg?key=xo3xz' },
  { id: 3, name: 'Sonic Waves', image: '/placeholder.svg?key=gvwmn' },
  { id: 4, name: 'Electric Dreams', image: '/placeholder.svg?key=uzfc0' },
];

export function ArtistLineup() {
  return (
    <section id="lineup" className="py-20 px-4 bg-background">
      <div className="max-w-6xl mx-auto">
        {/* Section Title */}
        <div className="text-center mb-16">
          <h2 className="text-5xl font-bold text-white mb-4">Lineup</h2>
          <p className="text-white/60">Amazing artists performing live</p>
        </div>

        {/* Artist Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {artists.map((artist) => (
            <div
              key={artist.id}
              className="group cursor-pointer"
            >
              <div className="relative overflow-hidden rounded-lg mb-4 aspect-square bg-white/5 border border-white/10 group-hover:border-blue-500/50 transition-all">
                <img
                  src={artist.image || "/placeholder.svg"}
                  alt={artist.name}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <h3 className="text-lg font-semibold text-white text-center group-hover:text-blue-400 transition">
                {artist.name}
              </h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
