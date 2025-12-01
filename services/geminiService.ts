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
      contents: `You are a professional karaoke lyrics transcriber and linguist specialized in Asian and Western music.
      Generate the complete, high-quality lyrics for the song "${songTitle}".
      
      Strict Requirements:
      1. **Language Support**: Fully support Thai (ภาษาไทย), English, and mixed languages. Preserve the original language of the song exactly.
      2. **Formatting**: 
         - Use clear section headers like [Verse], [Chorus], [Bridge], [Pre-Chorus].
         - Ensure separate lines for readability (Teleprompter style).
         - No extra conversational text (e.g., "Here is the result"). Return ONLY the lyrics.
      3. **Accuracy**: Ensure correct spelling and line breaks matching the song's rhythm.
      4. **Instrumental**: If the song is purely instrumental, return "[Instrumental Track]".
      `,
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