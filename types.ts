export interface SongData {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
}

export interface LyricsLine {
  time?: number; // Approximate timestamp in seconds (optional for this demo)
  text: string;
}

export enum ProcessingState {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  ERROR = 'ERROR'
}
