import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI, { toFile } from 'openai';

// Initialise the OpenAI client using the secret key from your environment.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Increase the body size limit for audio uploads.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { audio } = req.body as { audio?: string };

  if (!audio) {
    return res.status(400).json({ error: 'Missing audio data' });
  }

  try {
    // Decode the base64 string back into a Buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // Convert the buffer into a file object accepted by the OpenAI SDK. The
    // second parameter provides a filename with extension so the API can infer
    // the correct content type【900309422997225†L188-L201】.
    const file = await toFile(audioBuffer, 'audio.webm');

    // Transcribe the Japanese speech into text. Supplying the `language`
    // parameter helps the model produce more accurate results【486556340955242†L94-L103】.
    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'ja',
      response_format: 'text',
    });

    const japaneseText = typeof transcription === 'string' ? transcription : (transcription as any).text;

    // Prepare messages for translation using the chat completion API. A system
    // prompt instructs the model to behave as a translator from Japanese to Vietnamese.
    const messages = [
      {
        role: 'system',
        content:
          'Bạn là một dịch giả chuyên nghiệp. Hãy dịch tất cả tin nhắn của người dùng sang tiếng Việt.',
      },
      { role: 'user', content: japaneseText },
    ];

    // Request translation using GPT‑4o; adjust max_tokens and temperature as needed.
    const translationResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages as any,
      max_tokens: 2048,
      temperature: 0.2,
    });

    const translation = translationResponse.choices[0].message?.content?.trim() ?? '';

    // Generate Vietnamese speech audio using OpenAI's text-to-speech API.
    // Use a high-quality voice such as "nova" and the tts-1 model. The returned
    // response is a ReadableStream that can be converted into an ArrayBuffer,
    // then encoded as base64 to send to the client.
    const speechResponse = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: translation,
    });
    // Convert the response stream into a Buffer
    const speechArrayBuffer = await speechResponse.arrayBuffer();
    const speechBuffer = Buffer.from(speechArrayBuffer);
    const ttsAudio = speechBuffer.toString('base64');

    return res.status(200).json({ translation, audio: ttsAudio });
  } catch (error: any) {
    console.error('Error handling translation:', error);
    return res.status(500).json({ error: 'Failed to process audio' });
  }
}