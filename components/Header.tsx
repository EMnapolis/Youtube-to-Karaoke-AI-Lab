import React from 'react';
import { Mic2, Music4 } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="w-full py-6 px-4 md:px-8 border-b border-white/10 bg-black/20 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-blue-500 to-accent p-2 rounded-lg">
            <Mic2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
              Youtube to <span className="text-accent">Karaoke AI Lab</span>
            </h1>
            <p className="text-xs text-gray-400">One-click Instrumental Generator</p>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-2 text-sm text-gray-400 bg-white/5 px-3 py-1 rounded-full border border-white/10">
          <Music4 className="w-4 h-4" />
          <span>Powered by Gemini 2.5 Flash</span>
        </div>
      </div>
    </header>
  );
};