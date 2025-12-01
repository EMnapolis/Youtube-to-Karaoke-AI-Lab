import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateLyrics = async (songTitle: string, audioData?: { base64: string, mimeType: string }): Promise<string> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key provided. Returning mock lyrics.");
    return mockLyrics(songTitle);
  }

  try {
    const parts: any[] = [];

    // System instruction for the model
    const systemPrompt = `
      You are a professional karaoke lyrics transcriber and linguist.
      
      Task:
      ${audioData ? "Listen to the provided audio file and transcribe the lyrics exactly as they are sung." : `Retrieve or generate the lyrics for the song "${songTitle}".`}
      
      Strict Requirements:
      1. **Language**: Fully support Thai (ภาษาไทย), English, and mixed languages. Preserve the original language exactly.
      2. **Formatting**:
         - Group lines into stanzas (Verses, Chorus). 
         - Use clear section headers in brackets like [Verse], [Chorus].
         - Return ONLY the lyrics text. No conversational filler.
      3. **Spacing**: Do not add excessive blank lines. Keep verses compact.
      4. **Instrumental**: If the audio is purely instrumental with no vocals, return "[Instrumental Track]".
    `;

    // Add Audio Part if available
    if (audioData) {
      parts.push({
        inlineData: {
          mimeType: audioData.mimeType,
          data: audioData.base64
        }
      });
    }

    // Add Text Prompt
    parts.push({ text: systemPrompt });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts }, // Use 'parts' structure for multimodal
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

[Outro]
Yeah... just the music and me.
`;