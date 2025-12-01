import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateLyrics = async (songTitle: string): Promise<string> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key provided. Returning mock lyrics.");
    return mockLyrics(songTitle);
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a professional karaoke lyrics transcriber. 
      Generate the complete lyrics for the song likely identified by "${songTitle}". 
      
      Rules:
      1. Return ONLY the lyrics.
      2. No conversational filler or introductions.
      3. Mark sections clearly like [Verse 1], [Chorus], [Bridge].
      4. Ensure correct spacing between sections.
      5. If the song is instrumental, return "[Instrumental Track]".`,
    });

    return response.text || "Could not generate lyrics. Please try again.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error connecting to AI service for lyrics. Showing fallback lyrics.\n\n" + mockLyrics(songTitle);
  }
};

const mockLyrics = (title: string) => `[Verse 1]
Here we are, in the demo lab
Trying to sing, giving it a jab
The AI is thinking, processing the sound
Turning the vocals way, way down

[Chorus]
This is the ${title} karaoke beat
Feel the rhythm, feel the heat
Sing it loud, sing it free
It's just the music and me

[Verse 2]
Paste the iframe, watch it load
AI magic in the code
MP3 or WAV to save
Ride the sonic sound wave

[Chorus]
This is the ${title} karaoke beat
Feel the rhythm, feel the heat
Sing it loud, sing it free
It's just the music and me

[Bridge]
Download the track, take it away
Sing your heart out every day
High quality audio, crystal clear
The best karaoke app is here

[Chorus]
This is the ${title} karaoke beat
Feel the rhythm, feel the heat
Sing it loud, sing it free
It's just the music and me

[Outro]
Yeah... just the music and me.
(Fade out)
`;