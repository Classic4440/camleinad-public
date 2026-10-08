import React from 'react';
import Navbar from './Navbar';
import Footer from './Footer';
import MusicPlayer from '@/components/features/MusicPlayer';
import AnnouncementNotice from './AnnouncementNotice';
import { usePlayer } from '@/contexts/PlayerContext';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { state } = usePlayer();
  const hasPlayer = !!state.currentTrack;

  return (
    <div className="min-h-screen flex flex-col relative">
      <AnnouncementNotice />
      <Navbar />
      <main className={`flex-1 relative z-10 ${hasPlayer ? 'pb-24' : ''}`}>
        {children}
      </main>
      <Footer />
      {hasPlayer && <MusicPlayer />}
    </div>
  );
}
