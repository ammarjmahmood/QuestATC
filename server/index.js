import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'client')));

// Azure OpenAI config
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT; // e.g. https://your-resource.openai.azure.com
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
const AZURE_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

// ElevenLabs config
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // "Adam" - deep male voice

// Per-session conversation history
const sessions = new Map();

const ATC_SYSTEM_PROMPT = `You are a realistic Air Traffic Control (ATC) tower controller at a busy regional airport (KBOS - Boston Logan International, or adapt to whatever airport the pilot mentions). Your callsign is "Boston Tower" (or appropriate for the airport).

You are training a student pilot on proper radio communication procedures. Be realistic but patient.

## Your behavior:
- Use proper ATC phraseology at all times (FAA standards)
- Speak in clipped, professional radio style — short transmissions, no unnecessary words
- Use the NATO phonetic alphabet for letters (Alpha, Bravo, Charlie...)
- Read back numbers digit-by-digit for frequencies and squawk codes (e.g., "one-two-three-four" not "twelve thirty-four")
- Group altitude in hundreds/thousands (e.g., "climb and maintain three thousand")
- Include realistic details: runway numbers, taxiway letters, altimeter settings, wind info
- If the pilot makes a phraseology mistake, still respond in character but gently correct by modeling the right way

## Scenario flow (pre-departure training):
1. **ATIS**: When pilot requests ATIS/weather, give them current information (Information Alpha/Bravo/etc) with wind, visibility, altimeter, active runway, remarks
2. **Clearance Delivery**: Issue IFR/VFR clearance with squawk code, departure frequency, altitude
3. **Ground Control**: Give taxi instructions with specific taxiway routing (e.g., "taxi to runway two-two-left via Alpha, Charlie, hold short runway two-seven")
4. **Tower**: Handle takeoff clearance, traffic advisories

## Realistic details to include:
- Altimeter setting (e.g., "altimeter two-niner-niner-two")
- Wind (e.g., "wind two-seven-zero at one-two")
- Squawk codes (e.g., "squawk four-two-one-seven")
- Departure frequency (e.g., "departure frequency one-two-four-point-niner")
- Hold short instructions, progressive taxi if requested
- Traffic advisories (e.g., "traffic, Cessna one-seven-two on two mile final")

## Important:
- Keep responses SHORT like real ATC — typically 1-3 sentences max
- Always address the pilot by their callsign
- Wait for proper readback before moving to next instruction
- If the pilot says something unclear, say "say again" or "radio check, how do you hear?"
- Start by asking for the pilot's callsign and aircraft type if not provided

Respond ONLY with what ATC would say over the radio. No narration, no stage directions, no explanations outside of radio comms. Just the radio transmission text.`;

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { messages: [] });
  }
  return sessions.get(sessionId);
}

// Azure OpenAI chat completion
async function chatWithAzure(messages) {
  const url = `${AZURE_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${AZURE_API_VERSION}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'api-key': AZURE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: ATC_SYSTEM_PROMPT },
        ...messages,
      ],
      max_tokens: 300,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Azure OpenAI error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ATC chat endpoint
app.post('/api/atc', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const session = getSession(sessionId);
  session.messages.push({ role: 'user', content: message });

  // Keep conversation history manageable (last 40 messages)
  if (session.messages.length > 40) {
    session.messages = session.messages.slice(-40);
  }

  try {
    const atcReply = await chatWithAzure(session.messages);
    session.messages.push({ role: 'assistant', content: atcReply });
    res.json({ reply: atcReply });
  } catch (err) {
    console.error('Azure OpenAI error:', err.message);
    res.status(500).json({ error: 'ATC communication failure' });
  }
});

// ElevenLabs TTS endpoint - returns audio
app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });

  if (!ELEVENLABS_API_KEY) {
    return res.status(501).json({ error: 'ELEVENLABS_API_KEY not set — TTS disabled' });
  }

  try {
    const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.7,
          similarity_boost: 0.5,
          style: 0.0,
          use_speaker_boost: false,
        },
      }),
    });

    if (!ttsRes.ok) {
      const err = await ttsRes.text();
      console.error('ElevenLabs error:', err);
      return res.status(502).json({ error: 'TTS failed' });
    }

    res.set('Content-Type', 'audio/mpeg');
    const arrayBuf = await ttsRes.arrayBuffer();
    res.send(Buffer.from(arrayBuf));
  } catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: 'TTS error' });
  }
});

// Reset session
app.post('/api/reset', (req, res) => {
  const { sessionId = 'default' } = req.body;
  sessions.delete(sessionId);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ATC Sim running → http://localhost:${PORT}`);
  import('os').then(os => {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  Quest access   → http://${net.address}:${PORT}`);
        }
      }
    }
    console.log(`\n  Azure OpenAI:   ${AZURE_API_KEY ? 'configured' : 'NOT SET (set AZURE_OPENAI_* vars)'}`);
    console.log(`  ElevenLabs TTS: ${ELEVENLABS_API_KEY ? 'enabled' : 'DISABLED (set ELEVENLABS_API_KEY)'}\n`);
  });
});
