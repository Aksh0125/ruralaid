import axios from 'axios';

export interface TranslationResult {
  translatedText: string;
  originalText: string;
  detectedLanguage: string;
  wasTranslated: boolean;
}

/**
 * Detects language and translates to English using Google Translate free endpoint.
 * Falls back to original text if translation fails.
 */
export async function translateToEnglish(text: string): Promise<TranslationResult> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
    const response = await axios.get(url, { timeout: 5000 });
    const data = response.data;

    // Response format: [[[translatedText, originalText, ...], ...], ..., detectedLanguage]
    const translatedText = data[0]?.map((item: any) => item[0]).join('') || text;
    const detectedLanguage = data[2] || 'unknown';
    const wasTranslated = detectedLanguage !== 'en';

    return {
      translatedText: wasTranslated ? translatedText : text,
      originalText: text,
      detectedLanguage,
      wasTranslated,
    };
  } catch (err) {
    console.warn('[Translation] Failed, using original text:', (err as Error).message);
    return {
      translatedText: text,
      originalText: text,
      detectedLanguage: 'unknown',
      wasTranslated: false,
    };
  }
}
