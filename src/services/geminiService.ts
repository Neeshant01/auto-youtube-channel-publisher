import { GoogleGenAI, Modality, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export const geminiService = {
  // Discover and score trends
  async discoverTrends(niche: string, country: string, language: string) {
    const prompt = `Act as a viral content strategist. Discover the top 10 trending topics for a YouTube channel in the ${niche} niche for an audience in ${country} speaking ${language}. 
    For each topic, provide:
    - Topic title
    - Brief description
    - Momentum score (0-100) based on current viral potential
    - Category
    - Thumbnail emotional hook
    - Title curiosity gap potential
    
    Return the data as a JSON array of objects.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              topic: { type: Type.STRING },
              description: { type: Type.STRING },
              momentum: { type: Type.NUMBER },
              category: { type: Type.STRING },
              thumbnailHook: { type: Type.STRING },
              titleCuriosity: { type: Type.STRING }
            },
            required: ["topic", "momentum", "description"]
          }
        }
      }
    });

    return JSON.parse(response.text);
  },

  // Generate script and transcription (simulated extraction)
  async generateScript(topic: string, research: string, tone: string) {
    const prompt = `Create a high-engagement YouTube documentary script for the topic: "${topic}".
    Research data: ${research}
    Tone: ${tone}
    
    CRITICAL REQUIREMENTS:
    - The script MUST be at least 5 minutes long when spoken (approximately 800-1000 words).
    - Provide a detailed, in-depth exploration of the topic.
    
    Provide:
    1. Original English Script
    2. Hindi Script (Faithful translation)
    3. Hinglish Dubbing Script (Natural, conversational, using English terms where common)
    
    Include timestamps for each section.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            english: { type: Type.STRING },
            hindi: { type: Type.STRING },
            hinglish: { type: Type.STRING },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  timestamp: { type: Type.STRING },
                  text: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    return JSON.parse(response.text);
  },

  // Generate TTS Voiceover
  async generateVoiceover(text: string, voice: 'Kore' | 'Puck' | 'Fenrir' | 'Zephyr' = 'Kore') {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say in a professional documentary style: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return `data:audio/wav;base64,${base64Audio}`;
    }
    throw new Error("Failed to generate audio");
  },

  // Generate YouTube Metadata
  async generateMetadata(topic: string, script: string) {
    const prompt = `Generate YouTube metadata for a video about "${topic}".
    Script summary: ${script.substring(0, 1000)}
    
    CRITICAL REQUIREMENTS:
    - Titles MUST be provided in BOTH Hindi and English (e.g., "Title in English | हिंदी में शीर्षक").
    - Descriptions must be detailed and SEO-friendly.
    - Provide 15 relevant keyword tags.
    
    Provide:
    - 5 CTR-optimized titles (Hindi + English)
    - 3 SEO descriptions
    - 15 keyword tags
    - 5 hashtags
    - 1 pinned comment draft
    - Category suggestion`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            titles: { type: Type.ARRAY, items: { type: Type.STRING } },
            descriptions: { type: Type.ARRAY, items: { type: Type.STRING } },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
            pinnedComment: { type: Type.STRING },
            category: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text);
  },

  // Generate Thumbnail Concepts and Images
  async generateThumbnailConcepts(topic: string) {
    const prompt = `Generate 4 viral thumbnail concepts for a YouTube video about "${topic}".
    For each concept, provide:
    - Image generation prompt
    - Text overlay suggestion
    - Emotional hook
    - Color strategy`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              prompt: { type: Type.STRING },
              textOverlay: { type: Type.STRING },
              emotionalHook: { type: Type.STRING },
              colorStrategy: { type: Type.STRING }
            }
          }
        }
      }
    });

    const concepts = JSON.parse(response.text);
    
    // Generate images for each concept
    const conceptsWithImages = await Promise.all(concepts.map(async (concept: any) => {
      try {
        const imgResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts: [{ text: concept.prompt }] },
          config: { imageConfig: { aspectRatio: "16:9" } }
        });
        
        let imageUrl = "";
        for (const part of imgResponse.candidates[0].content.parts) {
          if (part.inlineData) {
            imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            break;
          }
        }
        return { ...concept, imageUrl };
      } catch (e) {
        console.error("Image generation failed", e);
        return { ...concept, imageUrl: "https://picsum.photos/seed/thumbnail/1280/720" };
      }
    }));

    return conceptsWithImages;
  },

  // Generate high-quality thumbnail using gemini-3-pro-image-preview
  async generateHighQualityThumbnail(prompt: string, size: '1K' | '2K' | '4K' = '1K') {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: size
        }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("Failed to generate high-quality image");
  },

  // Generate a single viral title
  async generateViralTitle(topic: string, niche: string) {
    const prompt = `Generate a single, highly viral YouTube title for a video about "${topic}" in the ${niche} niche. 
    The title should be in both English and Hindi (e.g., "English Title | हिंदी शीर्षक").
    Focus on curiosity gap and high CTR. Return ONLY the title string.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text.trim();
  },

  // Analyze a manually uploaded video description to generate metadata
  async analyzeManualVideo(description: string, topic: string) {
    const prompt = `Act as a YouTube SEO expert. I have a video about "${topic}". 
    Video Description: ${description}
    
    CRITICAL REQUIREMENTS:
    - Titles MUST be provided in BOTH Hindi and English (e.g., "Title in English | हिंदी में शीर्षक").
    - Descriptions must be detailed and SEO-friendly.
    - Provide 15 relevant keyword tags.
    
    Provide:
    - 5 CTR-optimized titles (Hindi + English)
    - 3 SEO descriptions
    - 15 keyword tags
    - 5 hashtags
    - 1 pinned comment draft
    - Category suggestion`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            titles: { type: Type.ARRAY, items: { type: Type.STRING } },
            descriptions: { type: Type.ARRAY, items: { type: Type.STRING } },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } },
            hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
            pinnedComment: { type: Type.STRING },
            category: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text);
  }
};
