import React, { useState, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { Button } from './components/Button';
import { generateLyrics } from './services/geminiService';
import { ProcessingState } from './types';
import { 
  Wand2, 
  Download, 
  PlayCircle, 
  Music,
  Code,
  Disc,
  Volume2
} from 'lucide-react';

// Robust ID extractor that handles URLs and standard YouTube Iframe codes
const getYoutubeId = (input: string) => {
  if (!input) return null;
  
  // 1. Try to find the src attribute if it's an iframe string
  const srcMatch = input.match(/src=["'](.*?)["']/);
  const urlToParse = srcMatch ? srcMatch[1] : input;

  // 2. Parse video ID from the URL
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = urlToParse.match(regExp);
  
  return match ? match[1] : null;
};

const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [videoID, setVideoID] = useState<string | null>(null);
  const [songTitle, setSongTitle] = useState('');
  const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);
  const [lyrics, setLyrics] = useState<string>('');
  const [progress, setProgress] = useState(0);

  const lyricsContainerRef = useRef<HTMLDivElement>(null);

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = getYoutubeId(url);
    if (!id) {
      alert("Invalid input. Please paste a valid YouTube URL or Iframe Embed code.");
      return;
    }

    setVideoID(id);
    setProcessingState(ProcessingState.PROCESSING);
    setProgress(0);
    setLyrics('');

    // Simulate progress bar for "Audio Separation"
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 95) return prev;
        return prev + Math.random() * 10;
      });
    }, 400);

    try {
      // 1. Fetch Lyrics from Gemini
      const searchTitle = songTitle || "the song in this video"; 
      const generatedLyrics = await generateLyrics(searchTitle);
      
      clearInterval(interval);
      setProgress(100);
      
      setTimeout(() => {
        setLyrics(generatedLyrics);
        setProcessingState(ProcessingState.READY);
      }, 600);

    } catch (error) {
      clearInterval(interval);
      setProcessingState(ProcessingState.ERROR);
      console.error(error);
    }
  };

  const handleDownload = (format: 'mp3' | 'wav') => {
    // Create a dummy blob to simulate download
    const dummyContent = `Instrumental Audio File for ${songTitle || videoID}\nFormat: ${format}\n(This is a simulation download)`;
    const blob = new Blob([dummyContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karaoke_instrumental_${(songTitle || 'track').replace(/\s+/g, '_')}.${format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen pb-40">
      <Header />

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-12">
        
        {/* Input Section */}
        <section className="max-w-3xl mx-auto space-y-6">
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              Youtube to Karaoke <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-accent">AI Lab</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Paste a YouTube Link or <b>Iframe Embed Code</b>. 
              Our AI extracts the music, removes vocals, and syncs lyrics instantly.
            </p>
          </div>

          <form onSubmit={handleProcess} className="space-y-4 bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-sm shadow-xl">
            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Code className="h-5 w-5 text-gray-500 group-focus-within:text-blue-400" />
                </div>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder='Paste YouTube Link or <iframe src="..."> code'
                  className="block w-full pl-10 pr-3 py-4 border border-white/10 rounded-xl leading-5 bg-black/40 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono text-sm"
                  required
                />
              </div>
              
               <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Music className="h-5 w-5 text-gray-500 group-focus-within:text-accent" />
                </div>
                <input
                  type="text"
                  value={songTitle}
                  onChange={(e) => setSongTitle(e.target.value)}
                  placeholder="Song Title / Artist (Optional - improves lyrics accuracy)"
                  className="block w-full pl-10 pr-3 py-3 border border-white/10 rounded-xl leading-5 bg-black/40 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-all"
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full text-lg shadow-blue-900/50" 
              variant="accent" 
              isLoading={processingState === ProcessingState.PROCESSING}
              icon={<Wand2 className="w-5 h-5"/>}
            >
              {processingState === ProcessingState.PROCESSING ? 'Processing Audio & Lyrics...' : 'Generate Karaoke Track'}
            </Button>
          </form>
          
          {processingState === ProcessingState.PROCESSING && (
            <div className="w-full bg-gray-800 rounded-full h-3 mt-6 overflow-hidden relative shadow-inner">
              <div 
                className="bg-gradient-to-r from-blue-500 via-purple-500 to-accent h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden" 
                style={{ width: `${progress}%` }}
              >
                 <div className="absolute inset-0 bg-white/20 animate-pulse-slow"></div>
              </div>
              <p className="text-center text-xs text-blue-300 mt-2 animate-pulse font-mono">
                {progress < 30 && "Analyzing Audio Spectrum..."}
                {progress >= 30 && progress < 60 && "Separating Vocals from Instrumentals..."}
                {progress >= 60 && "Generating & Syncing Lyrics..."}
              </p>
            </div>
          )}
        </section>

        {/* Main Work Area */}
        {processingState === ProcessingState.READY && videoID && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
            
            {/* Left: Original Video Source */}
            <div className="space-y-4">
              <div className="flex items-center justify-between text-gray-400 text-sm">
                <span className="flex items-center gap-2"><Disc className="w-4 h-4"/> Original Video</span>
                <span className="text-xs text-gray-500">Video Source</span>
              </div>
              
              <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-blue-900/20 border border-white/10 bg-black group">
                <iframe
                  className="w-full h-full"
                  style={{ border: 0 }}
                  src={`https://www.youtube.com/embed/${videoID}?rel=0&origin=${window.location.origin}`}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
              <p className="text-xs text-gray-500 text-center">
                Tip: You can mute this video and play the instrumental track below to sing along!
              </p>
            </div>

            {/* Right: Lyrics Teleprompter */}
            <div className="space-y-4">
               <div className="flex items-center justify-between text-gray-400 text-sm">
                <span className="flex items-center gap-2"><Code className="w-4 h-4"/> AI Lyrics</span>
                <span className="text-xs text-blue-400 border border-blue-400/30 px-2 py-0.5 rounded">Auto-Sync</span>
              </div>

              <div className="relative h-[400px] lg:h-[450px] bg-black/40 rounded-2xl border border-white/10 overflow-hidden flex flex-col shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black pointer-events-none z-10" />
                
                <div className="px-6 py-4 border-b border-white/10 bg-white/5 backdrop-blur-md z-20 flex justify-between items-center">
                  <h3 className="font-bold text-lg flex items-center gap-2 text-white">
                    <PlayCircle className="w-5 h-5 text-accent" />
                    Teleprompter
                  </h3>
                </div>

                <div 
                  ref={lyricsContainerRef}
                  className="flex-1 overflow-y-auto p-8 space-y-8 text-center scroll-smooth"
                >
                  <div className="h-4"></div> {/* Top Spacer */}
                  {lyrics ? (
                    lyrics.split('\n').map((line, index) => {
                      const cleanLine = line.trim();
                      if (!cleanLine) return <br key={index} className="h-4 block"/>;
                      
                      const isStructure = cleanLine.startsWith('(') || cleanLine.startsWith('[');
                      
                      if (isStructure) {
                        return (
                          <div key={index} className="py-4">
                              <span className="text-xs font-bold text-accent border border-accent/30 px-3 py-1 rounded-full uppercase tracking-widest bg-accent/10">
                                {cleanLine.replace(/[()\[\]]/g, '')}
                              </span>
                          </div>
                        );
                      }

                      return (
                        <p 
                          key={index} 
                          className="text-2xl md:text-3xl font-bold text-gray-300 hover:text-white hover:scale-105 transition-all duration-300 cursor-default leading-relaxed"
                          style={{ textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}
                        >
                          {cleanLine}
                        </p>
                      );
                    })
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4">
                      <Wand2 className="w-12 h-12 animate-pulse opacity-50"/>
                      <p>Waiting for AI generation...</p>
                    </div>
                  )}
                  {/* Spacing for bottom fade */}
                  <div className="h-32" />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FIXED BOTTOM INSTRUMENTAL PLAYER */}
      {processingState === ProcessingState.READY && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
           <div className="bg-gradient-to-r from-surface via-background to-surface border-t border-accent/50 backdrop-blur-xl p-4 shadow-2xl shadow-accent/20">
             <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-6">
                
                {/* Info */}
                <div className="flex items-center gap-4 min-w-[200px]">
                   <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center shadow-lg animate-pulse-slow">
                      <Music className="w-6 h-6 text-white" />
                   </div>
                   <div>
                      <h4 className="text-white font-bold text-sm">Instrumental Track</h4>
                      <p className="text-accent text-xs font-mono">Vocals Removed (AI)</p>
                   </div>
                </div>

                {/* Player Controls (Standard HTML Audio for demo) */}
                <div className="flex-1 w-full">
                    {/* Note: In a real app, src would be the processed blob URL */}
                    <audio 
                      controls 
                      className="w-full h-10 opacity-90 hover:opacity-100 transition-opacity"
                      // Using a dummy silent file or just rendering controls for the UI Lab demo
                      // In a real implementation this would be the blob url from the backend
                    >
                      <source src="" type="audio/mp3" />
                      Your browser does not support the audio element.
                    </audio>
                </div>

                {/* Downloads */}
                <div className="flex gap-2 min-w-[240px]">
                   <Button 
                      variant="secondary" 
                      className="flex-1 text-xs h-10 px-3 bg-white/5 hover:bg-white/10" 
                      onClick={() => handleDownload('mp3')}
                    >
                      <Download className="w-3 h-3 mr-2 text-blue-400" /> MP3
                    </Button>
                    <Button 
                      variant="accent" 
                      className="flex-1 text-xs h-10 px-3" 
                      onClick={() => handleDownload('wav')}
                    >
                      <Download className="w-3 h-3 mr-2" /> WAV
                    </Button>
                </div>

             </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;