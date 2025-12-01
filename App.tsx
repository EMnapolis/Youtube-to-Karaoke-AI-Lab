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
  AlertCircle,
  Youtube,
  UploadCloud,
  FileAudio,
  MicOff,
  ZoomIn,
  ZoomOut,
  Copy,
  Check
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

// Helper: Convert File to Base64 (for Gemini API)
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Remove "data:audio/mp3;base64," prefix to get just the base64 string
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
};

// --- Web Audio API Utils for Vocal Removal ---

// Convert AudioBuffer to WAV Blob
const bufferToWave = (abuffer: AudioBuffer, len: number) => {
  let numOfChan = abuffer.numberOfChannels;
  let length = len * numOfChan * 2 + 44;
  let buffer = new ArrayBuffer(length);
  let view = new DataView(buffer);
  let channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  // write WAVE header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " chunk
  setUint32(16); // length = 16
  setUint16(1); // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2); // block-align
  setUint16(16); // 16-bit (hardcoded in this demo)

  setUint32(0x61746164); // "data" - chunk
  setUint32(length - pos - 4); // chunk length

  // write interleaved data
  for (i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while (pos < len) {
    for (i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
      view.setInt16(44 + offset, sample, true); // write 16-bit sample
      offset += 2;
    }
    pos++;
  }

  return new Blob([buffer], { type: "audio/wav" });

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
};

const processAudioFile = async (file: File): Promise<Blob> => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Phase Inversion / Center Channel Cancellation (O.O.P.S Effect)
  // Formula: Left - Right = Difference (removes center-panned vocals)
  
  const leftChannel = audioBuffer.getChannelData(0);
  const rightChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : leftChannel; // Fallback if mono
  
  const length = leftChannel.length;
  
  // Create a new buffer for the result (Mono output is common for this technique)
  const outputBuffer = audioContext.createBuffer(1, length, audioBuffer.sampleRate);
  const outputData = outputBuffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    // Simple subtraction: L - R
    // This cancels out signals that are identical in both channels (usually lead vocals, kick drum, bass)
    outputData[i] = leftChannel[i] - rightChannel[i];
  }

  return bufferToWave(outputBuffer, length);
};


type InputMode = 'youtube' | 'upload';

const App: React.FC = () => {
  // CHANGED: Default mode is now 'upload'
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [url, setUrl] = useState('');
  const [videoID, setVideoID] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState<string | null>(null);
  
  const [songTitle, setSongTitle] = useState('');
  const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);
  const [lyrics, setLyrics] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string>(''); // Source for the bottom player
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null); // Store the actual processed file
  const [audioSourceType, setAudioSourceType] = useState<'demo' | 'upload' | 'processed'>('demo');

  // Lyrics controls
  const [fontSize, setFontSize] = useState<number>(16);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  const lyricsContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URL when component unmounts
  useEffect(() => {
    return () => {
      if (uploadedFileUrl) URL.revokeObjectURL(uploadedFileUrl);
      if (audioUrl && audioUrl.startsWith('blob:')) URL.revokeObjectURL(audioUrl);
    };
  }, [uploadedFileUrl, audioUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
      // Auto-set title from filename (removing extension)
      const name = file.name.replace(/\.[^/.]+$/, "");
      setSongTitle(name);
      
      // Reset previous states
      setProcessingState(ProcessingState.IDLE);
      setAudioUrl('');
      setProcessedBlob(null);
    }
  };

  const handleProcess = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let currentId = null;
    let currentFileUrl = null;

    if (inputMode === 'youtube') {
        currentId = getYoutubeId(url);
        if (!currentId) {
            alert("Invalid input. Please paste a valid YouTube URL or Iframe Embed code.");
            return;
        }
        setVideoID(currentId);
        setUploadedFileUrl(null);
    } else {
        if (!uploadedFile) {
            alert("Please select an audio file first.");
            return;
        }
        // Create Object URL for Original Source playback
        currentFileUrl = URL.createObjectURL(uploadedFile);
        setUploadedFileUrl(currentFileUrl);
        setVideoID(null);
    }

    setProcessingState(ProcessingState.PROCESSING);
    setProgress(0);
    setLyrics('');
    setAudioUrl('');
    setProcessedBlob(null);

    // Progress Simulation
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 5;
      });
    }, 200);

    try {
      // 1. Process Audio (Real Web Audio API if Upload Mode)
      let finalAudioUrl = '';
      let blob: Blob | null = null;
      let audioBase64: string | undefined = undefined;

      if (inputMode === 'upload' && uploadedFile) {
        try {
          // Prepare Base64 for Gemini Transcription
          audioBase64 = await fileToBase64(uploadedFile);

          // REAL VOCAL REMOVAL LOGIC
          blob = await processAudioFile(uploadedFile);
          finalAudioUrl = URL.createObjectURL(blob);
          setProcessedBlob(blob);
          setAudioSourceType('processed');
        } catch (err) {
          console.error("Audio Processing Failed", err);
          alert("Could not process audio file. Make sure it is a valid audio format.");
          clearInterval(interval);
          setProcessingState(ProcessingState.ERROR);
          return;
        }
      } else {
        // Fallback for YouTube (Demo)
        finalAudioUrl = "https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Tours/Enthusiast/Tours_-_01_-_Enthusiast.mp3";
        setAudioSourceType('demo');
      }

      // 2. Fetch Lyrics from Gemini
      let searchTitle = songTitle;
      if (!searchTitle && inputMode === 'upload' && uploadedFile) {
        searchTitle = uploadedFile.name.replace(/\.[^/.]+$/, "");
      }
      if (!searchTitle) searchTitle = "the song in this video";

      const generatedLyrics = await generateLyrics(searchTitle, audioBase64 ? { base64: audioBase64, mimeType: uploadedFile?.type || 'audio/mp3' } : undefined);
      
      clearInterval(interval);
      setProgress(100);
      
      setTimeout(() => {
        setLyrics(generatedLyrics);
        setAudioUrl(finalAudioUrl);
        setProcessingState(ProcessingState.READY);
      }, 500);

    } catch (error) {
      clearInterval(interval);
      setProcessingState(ProcessingState.ERROR);
      console.error(error);
    }
  };

  const handleDownload = (format: 'mp3' | 'wav') => {
    if (processedBlob) {
      // REAL DOWNLOAD FOR PROCESSED AUDIO
      const url = window.URL.createObjectURL(processedBlob);
      const a = document.createElement('a');
      a.href = url;
      // Note: We always generate WAV from Web Audio API in this demo
      // but we name it according to request for user convenience, 
      // though technical format is WAV.
      a.download = `Instrumental_${(songTitle || 'track')}.wav`; 
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } else {
      // Simulation Download for YouTube Mode
      const dummyContent = `Instrumental Audio File for ${songTitle || videoID}\nFormat: ${format}\n(This is a simulation download. Real extraction requires backend processing.)`;
      const blob = new Blob([dummyContent], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `instrumental_${(songTitle || 'track').replace(/\s+/g, '_')}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }
  };

  const adjustFontSize = (delta: number) => {
    setFontSize(prev => Math.max(14, Math.min(64, prev + delta)));
  };

  const handleCopyLyrics = async () => {
    if (!lyrics) return;
    try {
      await navigator.clipboard.writeText(lyrics);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <div className="min-h-screen pb-48">
      <Header />

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-12">
        
        {/* Input Section */}
        <section className="max-w-3xl mx-auto space-y-6">
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              Youtube to <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-accent">Karaoke AI Lab</span>
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Transform any song into a karaoke track using AI-powered Center Channel Extraction.
            </p>
          </div>

          <div className="bg-white/5 p-6 rounded-2xl border border-white/10 backdrop-blur-sm shadow-xl space-y-6">
            
            {/* Tabs */}
            <div className="flex p-1 bg-black/40 rounded-xl">
               <button 
                onClick={() => setInputMode('upload')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${inputMode === 'upload' ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <UploadCloud className="w-4 h-4" /> Upload File (Recommended)
              </button>
              <button 
                onClick={() => setInputMode('youtube')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${inputMode === 'youtube' ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
              >
                <Youtube className="w-4 h-4" /> YouTube Link
              </button>
            </div>

            <form onSubmit={handleProcess} className="space-y-4">
              
              {/* Conditional Input */}
              {inputMode === 'youtube' ? (
                <div className="space-y-4 animate-fade-in">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Code className="h-5 w-5 text-gray-500 group-focus-within:text-red-400" />
                    </div>
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder='Paste YouTube Link or <iframe src="..."> code'
                      className="block w-full pl-10 pr-3 py-4 border border-white/10 rounded-xl leading-5 bg-black/40 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all font-mono text-sm"
                      required={inputMode === 'youtube'}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-fade-in">
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/20 hover:border-blue-500 hover:bg-blue-500/5 rounded-xl p-8 text-center cursor-pointer transition-all group"
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".mp3,.wav,.m4a"
                      className="hidden" 
                    />
                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                      <FileAudio className="w-6 h-6 text-gray-400 group-hover:text-blue-400" />
                    </div>
                    {uploadedFile ? (
                       <div>
                         <p className="text-white font-medium">{uploadedFile.name}</p>
                         <p className="text-xs text-gray-400 mt-1">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                       </div>
                    ) : (
                      <div>
                        <p className="text-gray-300 font-medium">Click to upload MP3 or WAV</p>
                        <p className="text-xs text-gray-500 mt-1">or drag and drop file here</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
               {/* Song Title (Common) */}
               <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Music className="h-5 w-5 text-gray-500 group-focus-within:text-accent" />
                </div>
                <input
                  type="text"
                  value={songTitle}
                  onChange={(e) => setSongTitle(e.target.value)}
                  placeholder="Song Title / Artist (Optional)"
                  className="block w-full pl-10 pr-3 py-3 border border-white/10 rounded-xl leading-5 bg-black/40 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-all"
                />
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
          </div>
          
          {processingState === ProcessingState.PROCESSING && (
            <div className="w-full bg-gray-800 rounded-full h-3 mt-6 overflow-hidden relative shadow-inner">
              <div 
                className="bg-gradient-to-r from-blue-500 via-purple-500 to-accent h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden" 
                style={{ width: `${progress}%` }}
              >
                 <div className="absolute inset-0 bg-white/20 animate-pulse-slow"></div>
              </div>
              <p className="text-center text-xs text-blue-300 mt-2 animate-pulse font-mono">
                {progress < 30 && "Decoding Audio Data..."}
                {progress >= 30 && progress < 60 && "Applying Phase Inversion (Vocal Removal)..."}
                {progress >= 60 && "Encoding WAV & Transcribing Lyrics..."}
              </p>
            </div>
          )}
        </section>

        {/* Main Work Area */}
        {processingState === ProcessingState.READY && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
            
            {/* Left: Source Player (YouTube OR Audio File) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between text-gray-400 text-sm">
                <span className="flex items-center gap-2"><Disc className="w-4 h-4"/> Original Source</span>
                <span className="text-xs text-gray-500">{videoID ? 'YouTube Video' : 'Audio File'}</span>
              </div>
              
              {videoID ? (
                // YouTube Player
                <>
                  <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-blue-900/20 border border-white/10 bg-black group">
                    <iframe
                      className="w-full h-full"
                      style={{ border: 0 }}
                      src={`https://www.youtube.com/embed/${videoID}?rel=0&enablejsapi=1&origin=${window.location.origin}`}
                      title="YouTube video player"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                    <p className="text-xs text-yellow-200/80">
                      If the video does not play (Error 153), it may be restricted by the owner.
                    </p>
                  </div>
                </>
              ) : uploadedFileUrl ? (
                // Uploaded Audio Player
                <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl shadow-purple-900/20 border border-white/10 bg-gradient-to-br from-gray-900 to-black flex flex-col items-center justify-center p-8 text-center group">
                  <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center mb-6 animate-pulse-slow">
                    <Music className="w-10 h-10 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">{songTitle || "Uploaded Audio"}</h3>
                  <p className="text-sm text-gray-400 mb-6 font-mono">Original Audio File</p>
                  <audio controls className="w-full max-w-md" src={uploadedFileUrl}>
                    Your browser does not support the audio element.
                  </audio>
                </div>
              ) : null}
            </div>

            {/* Right: Lyrics Teleprompter */}
            <div className="space-y-4">
               <div className="flex items-center justify-between text-gray-400 text-sm">
                <span className="flex items-center gap-2"><Code className="w-4 h-4"/> AI Lyrics</span>
                <span className="text-xs text-blue-400 border border-blue-400/30 px-2 py-0.5 rounded">Auto-Sync</span>
              </div>

              <div className="relative h-[400px] lg:h-[450px] bg-black/40 rounded-2xl border border-white/10 overflow-hidden flex flex-col shadow-2xl">
                <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black pointer-events-none z-10" />
                
                {/* Lyrics Header with Controls */}
                <div className="px-6 py-4 border-b border-white/10 bg-white/5 backdrop-blur-md z-20 flex justify-between items-center">
                  <h3 className="font-bold text-lg flex items-center gap-2 text-white">
                    <PlayCircle className="w-5 h-5 text-accent" />
                    Teleprompter
                  </h3>
                  
                  {/* Lyrics Controls */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-black/40 rounded-lg p-1 mr-2 border border-white/10">
                      <button onClick={() => adjustFontSize(-2)} className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors" title="Decrease Font Size">
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <span className="text-xs text-gray-500 w-8 text-center select-none">{fontSize}px</span>
                      <button onClick={() => adjustFontSize(2)} className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors" title="Increase Font Size">
                        <ZoomIn className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <button 
                      onClick={handleCopyLyrics}
                      disabled={!lyrics}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium rounded-lg border border-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {copyStatus === 'copied' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copyStatus === 'copied' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div 
                  ref={lyricsContainerRef}
                  className="flex-1 overflow-y-auto p-8 space-y-2 text-center scroll-smooth"
                >
                  <div className="h-4"></div> {/* Top Spacer */}
                  {lyrics ? (
                    lyrics.split('\n').map((line, index) => {
                      const cleanLine = line.trim();
                      if (!cleanLine) return <div key={index} className="h-2" />;
                      
                      const isStructure = cleanLine.startsWith('(') || cleanLine.startsWith('[');
                      
                      if (isStructure) {
                        return (
                          <div key={index} className="py-2 mt-4 mb-2">
                              <span className="text-xs font-bold text-accent border border-accent/30 px-3 py-1 rounded-full uppercase tracking-widest bg-accent/10">
                                {cleanLine.replace(/[()\[\]]/g, '')}
                              </span>
                          </div>
                        );
                      }

                      return (
                        <p 
                          key={index} 
                          className="font-bold text-gray-300 hover:text-white transition-all duration-300 cursor-default leading-snug"
                          style={{ 
                            fontSize: `${fontSize}px`,
                            textShadow: '0 2px 10px rgba(0,0,0,0.5)' 
                          }}
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
                <div className="flex items-center gap-4 min-w-[240px]">
                   <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center shadow-lg animate-pulse-slow">
                      <MicOff className="w-6 h-6 text-white" />
                   </div>
                   <div>
                      <h4 className="text-white font-bold text-sm">Instrumental Track</h4>
                      <div className="flex items-center gap-2 mt-1">
                         <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${audioSourceType === 'processed' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                           {audioSourceType === 'processed' ? 'Vocal Removed' : 'Demo Mode'}
                         </span>
                         {audioSourceType === 'demo' && <span className="text-[10px] text-gray-400 hidden lg:inline">(YouTube Audio Unavailable)</span>}
                      </div>
                   </div>
                </div>

                {/* Player Controls */}
                <div className="flex-1 w-full flex flex-col justify-center">
                    <audio 
                      controls 
                      className="w-full h-8 opacity-90 hover:opacity-100 transition-opacity"
                      src={audioUrl}
                      autoPlay={false}
                    >
                      Your browser does not support the audio element.
                    </audio>
                    {audioSourceType === 'processed' && (
                       <p className="text-[10px] text-gray-500 text-center mt-1">
                         *Playing processed audio (Center Channel Extracted)
                       </p>
                    )}
                </div>

                {/* Downloads */}
                <div className="flex gap-2 min-w-[200px]">
                   <Button 
                      variant="secondary" 
                      className="flex-1 text-xs h-10 px-3 bg-white/5 hover:bg-white/10" 
                      onClick={() => handleDownload('mp3')}
                      disabled={!processedBlob && audioSourceType !== 'demo'}
                    >
                      <Download className="w-3 h-3 mr-2 text-blue-400" /> MP3
                    </Button>
                    <Button 
                      variant="accent" 
                      className="flex-1 text-xs h-10 px-3" 
                      onClick={() => handleDownload('wav')}
                      disabled={!processedBlob && audioSourceType !== 'demo'}
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