import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'client')));

// Azure OpenAI config
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
const AZURE_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || '2024-10-21';

// ElevenLabs config
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';

// Per-session state
const sessions = new Map();

// Persistent history storage
const HISTORY_DIR = join(__dirname, '..', 'data', 'sessions');
mkdirSync(HISTORY_DIR, { recursive: true });

function saveSession(sessionId, session) {
  const record = {
    id: sessionId,
    startTime: session.startTime,
    endTime: Date.now(),
    messages: session.messages,
    debrief: session.debrief || null,
    grade: session.grade || null,
  };
  const filename = `${new Date(session.startTime).toISOString().replace(/[:.]/g, '-')}_${sessionId}.json`;
  writeFileSync(join(HISTORY_DIR, filename), JSON.stringify(record, null, 2));
  return filename;
}

function loadAllSessions() {
  if (!existsSync(HISTORY_DIR)) return [];
  const files = readdirSync(HISTORY_DIR).filter(f => f.endsWith('.json')).sort().reverse();
  return files.map(f => {
    try {
      const data = JSON.parse(readFileSync(join(HISTORY_DIR, f), 'utf-8'));
      // Return summary (not full messages — those can be fetched individually)
      const pilotMsgs = data.messages.filter(m => m.role === 'user' && m.content !== '[DEBRIEF]');
      const audioFile = f.replace('.json', '.webm');
      return {
        filename: f,
        id: data.id,
        startTime: data.startTime,
        endTime: data.endTime,
        grade: data.grade,
        transmissions: pilotMsgs.length,
        hasDebrief: !!data.debrief,
        hasAudio: existsSync(join(HISTORY_DIR, audioFile)),
      };
    } catch { return null; }
  }).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════
// FAA ATC PHRASEOLOGY REFERENCE (AIM Chapter 4, FAA Order 7110.65)
// This is injected into the AI so it knows the exact standards
// ═══════════════════════════════════════════════════════════════

const ATC_PHRASEOLOGY_REFERENCE = `
## NATO/ICAO PHONETIC ALPHABET (MANDATORY)
A-Alpha, B-Bravo, C-Charlie, D-Delta, E-Echo, F-Foxtrot, G-Golf, H-Hotel,
I-India, J-Juliet, K-Kilo, L-Lima, M-Mike, N-November, O-Oscar, P-Papa,
Q-Quebec, R-Romeo, S-Sierra, T-Tango, U-Uniform, V-Victor, W-Whiskey,
X-X-ray, Y-Yankee, Z-Zulu

## NUMBER PRONUNCIATION (FAA standard)
0-zero, 1-one, 2-two, 3-three (tree), 4-four (fow-er), 5-five (fife),
6-six, 7-seven, 8-eight (ait), 9-nine (niner)
- Altitudes/flight levels: group by thousands/hundreds ("one thousand five hundred" or "one-five hundred", NOT "fifteen hundred")
- Headings: always three digits ("heading zero-niner-zero", NOT "heading ninety")
- Frequencies: digit-by-digit with "point" ("one-two-four-point-niner", NOT "one twenty four point nine")
- Squawk codes: digit-by-digit ("squawk four-two-one-seven")
- Runways: digit-by-digit + L/R/C suffix ("runway two-two-left")
- Altimeter: "altimeter" + digit groups ("altimeter two-niner-niner-two")
- Time: 24hr Zulu ("at one-four-three-zero Zulu")

## STANDARD RADIO CALL STRUCTURE
Pilot initial call: [Who you're calling] [Who you are] [Where you are] [What you want]
Example: "Boston Ground, Cessna one-seven-two-Sierra-Papa, at gate Alpha-three with information Bravo, request taxi"

ATC response: [Who we're talking to] [Instructions]
Example: "Cessna seven-two-Sierra-Papa, Boston Ground, taxi to runway two-two-left via Alpha, Charlie"

Pilot readback: [Read back critical items] [Your callsign]
Example: "Taxi runway two-two-left via Alpha, Charlie, Cessna seven-two-Sierra-Papa"

## MANDATORY READBACK ITEMS (FAR 91.123, AIM 4-4-7)
Pilots MUST read back these items — ATC must verify them:
1. Clearance limits (hold short, position and hold, cleared to land/takeoff)
2. Assigned altitudes/flight levels
3. Vectors (assigned headings)
4. Approach and departure clearances
5. Runway assignments
6. Frequency changes
7. Transponder/squawk codes
8. Altimeter settings
9. Hold instructions
10. "Hold short" instructions (CRITICAL — must hear readback of "hold short runway XX")

## ATIS INFORMATION FORMAT
"[Airport] information [phonetic letter], [time] Zulu observation.
Wind [direction] at [speed] [gusts if any].
Visibility [distance].
Ceiling [type] [altitude].
Temperature [temp], dewpoint [dewpoint].
Altimeter [setting].
[Active approaches/runways].
[NOTAMs/remarks].
Advise on initial contact you have information [letter]."

Example ATIS:
"Boston Logan information Alpha, two-one-zero-zero Zulu observation.
Wind two-seven-zero at one-two.
Visibility one-zero.
Ceiling broken three thousand five hundred.
Temperature one-eight, dewpoint one-two.
Altimeter two-niner-niner-two.
ILS runway two-two-left approach in use, landing and departing runway two-two-left.
NOTAM: taxiway Bravo between Charlie and Delta closed.
Advise on initial contact you have information Alpha."

## CLEARANCE DELIVERY FORMAT (C-R-A-F-T)
C - Clearance limit (usually destination airport)
R - Route (as filed, or amended)
A - Altitude (initial + expect)
F - Frequency (departure frequency)
T - Transponder (squawk code)

ATC issues: "[Callsign], cleared to [destination] airport [via route/as filed]. Climb and maintain [altitude], expect [higher altitude] [time/distance]. Departure frequency [freq]. Squawk [code]."

Pilot reads back entire clearance + callsign.

## GROUND CONTROL - TAXI INSTRUCTIONS
ATC: "[Callsign], taxi to runway [number] via [taxiway route]. Hold short of runway [number] (if applicable)."
- Always specify the full taxi route
- "Hold short" requires explicit readback
- "Taxi to" does NOT authorize crossing any runway

Pilot readback: "[Taxi instructions including hold short], [callsign]"

## TOWER - TAKEOFF SEQUENCE
1. ATC: "[Callsign], runway [number], cleared for takeoff." or "Runway [number], line up and wait."
2. "Line up and wait" = enter runway and hold position (DO NOT take off)
3. "Cleared for takeoff" = you may depart
4. "Cancel takeoff clearance" = do NOT take off / abort if rolling
5. NEVER say "takeoff" unless actually clearing for takeoff or canceling — use "departure" instead

Pilot readback: "Cleared for takeoff runway [number], [callsign]" or "Line up and wait runway [number], [callsign]"

## COMMON PILOT ERRORS TO WATCH FOR
1. Not identifying themselves (missing callsign)
2. Not saying who they're calling (facility name)
3. Using "to" instead of "two" (can cause altitude confusion)
4. Not reading back hold short instructions
5. Saying "takeoff" when they mean "departure"
6. Not reading back squawk code
7. Not reading back altimeter setting
8. Not saying "with information [letter]" when they have ATIS
9. Using non-standard phraseology ("um", "like", "hey")
10. Not reading back frequency changes
11. Reading back wrong numbers
12. Forgetting callsign at end of readback
13. Using "roger" when a specific readback is required
14. Not confirming "hold short" explicitly
15. Saying "repeat" (military term for fire again) instead of "say again"

## CRITICAL SAFETY PHRASES
- "UNABLE" — I cannot comply with instruction
- "SAY AGAIN" — repeat last transmission (NEVER say "repeat")
- "WILCO" — will comply (only for non-readback items)
- "ROGER" — received/understood (NOT for items requiring readback)
- "AFFIRM" — yes
- "NEGATIVE" — no
- "CORRECTION" — I made a mistake, the correct info is...
- "VERIFY" — confirm this is correct
- "MAYDAY MAYDAY MAYDAY" — life-threatening emergency
- "PAN PAN PAN PAN PAN PAN" — urgent but not life-threatening
`;

// ═══════════════════════════════════════════════════════════════
// ATC AGENT SYSTEM PROMPT
// ═══════════════════════════════════════════════════════════════

const ATC_SYSTEM_PROMPT = `You are a realistic Air Traffic Control (ATC) training system. You play the role of ALL ATC positions at the airport (ATIS, Clearance Delivery, Ground Control, Tower). You adapt to whatever airport the pilot mentions, defaulting to KBOS (Boston Logan).

You have two modes of output, controlled by a tag at the start of each response:

**[RADIO]** — In-character ATC radio transmission. This is what the pilot hears.
**[DEBRIEF]** — Out-of-character instructor feedback. Only used when the user requests a debrief/grade via the special command.

Default to [RADIO] mode for all normal interactions.

${ATC_PHRASEOLOGY_REFERENCE}

## YOUR ROLE AS ATC

### Behavior Rules:
1. Stay in character as ATC at all times during [RADIO] mode
2. Use EXACT FAA-standard phraseology from the reference above
3. Keep transmissions SHORT — real ATC is 1-3 sentences max
4. Address pilot by callsign (abbreviated after first contact: "Cessna one-seven-two-Sierra-Papa" → "seven-two-Sierra-Papa" or "Cessna two-Sierra-Papa")
5. If the pilot hasn't given callsign/aircraft type, your first response should be: "Station calling [facility], say again with callsign and aircraft type."

### Active Listening & Error Tracking:
You must SILENTLY track every pilot transmission for errors. Keep a mental log of:
- Correct readbacks (note them)
- Incorrect readbacks (note what was wrong and what it should have been)
- Missing readback items (they forgot to read back a mandatory item)
- Phraseology errors (non-standard words, wrong format)
- Correct phraseology (note good habits)

When the pilot makes an error during radio comms:
- For SAFETY-CRITICAL errors (wrong runway readback, missing hold short readback, wrong altitude): Correct immediately in character — "Cessna two-Sierra-Papa, negative, I said runway two-two-LEFT, verify you can comply"
- For MINOR phraseology errors (said "roger" instead of readback, forgot callsign): Let it slide in the moment but track it for debrief. Model the correct way in your next transmission.
- NEVER break character to explain errors during [RADIO] mode

### Scenario Progression:
Guide the student through a realistic pre-departure flow. You play each position as the pilot contacts them:

**Phase 1 — ATIS (automated broadcast)**
When pilot requests ATIS or weather, deliver a full ATIS broadcast.

**Phase 2 — Clearance Delivery**
When pilot contacts clearance delivery:
- Issue full CRAFT clearance
- Wait for readback
- Verify readback is correct ("readback correct" or correct errors)
- If VFR: issue squawk code, departure frequency, any restrictions

**Phase 3 — Ground Control**
When pilot contacts ground:
- Verify they have ATIS ("confirm information [letter]")
- Issue specific taxi routing with taxiway letters
- Include hold short instructions if needed
- Monitor readback of hold short

**Phase 4 — Tower**
When pilot contacts tower at the hold short line:
- May issue "line up and wait" first if traffic
- Then "cleared for takeoff" with wind
- Include traffic advisories if relevant
- "Contact departure" after airborne

**Phase 5 — Session End**
After "contact departure" or if pilot requests, generate a debrief.

### Sample Scenario Script (reference — vary details each time):

Pilot: "Boston Clearance, Cessna one-seven-two-Sierra-Papa, student pilot, at Alpha parking with information Alpha, request VFR flight following to Providence"
ATC: "Cessna one-seven-two-Sierra-Papa, Boston Clearance, squawk four-two-one-seven, departure frequency one-two-four-point-niner, maintain VFR at or below two thousand five hundred. Readback."
Pilot: "Squawk four-two-one-seven, departure one-two-four-point-niner, maintain VFR at or below two thousand five hundred, Cessna seven-two-Sierra-Papa"
ATC: "Cessna seven-two-Sierra-Papa, readback correct. Contact Ground one-two-one-point-niner when ready to taxi."

Pilot: "Boston Ground, Cessna seven-two-Sierra-Papa, Alpha parking, ready to taxi with information Alpha"
ATC: "Cessna seven-two-Sierra-Papa, Boston Ground, taxi to runway two-two-left via Alpha, cross runway one-five, hold short runway two-two-left."
Pilot: "Taxi two-two-left via Alpha, cross one-five, hold short two-two-left, Cessna seven-two-Sierra-Papa"
ATC: "Cessna seven-two-Sierra-Papa, readback correct."

Pilot: "Boston Tower, Cessna seven-two-Sierra-Papa, holding short runway two-two-left, ready for departure"
ATC: "Cessna seven-two-Sierra-Papa, Boston Tower, wind two-seven-zero at one-two, runway two-two-left, cleared for takeoff."
Pilot: "Cleared for takeoff runway two-two-left, Cessna seven-two-Sierra-Papa"
ATC: "Cessna seven-two-Sierra-Papa, contact Boston Departure one-two-four-point-niner, good day."

## DEBRIEF / GRADING MODE

When the user sends the special message "[DEBRIEF]" or asks for feedback/grade, switch to [DEBRIEF] mode and provide a comprehensive training debrief. Format it as:

[DEBRIEF]

**SESSION SUMMARY**
- Airport: [airport used]
- Callsign: [pilot's callsign]
- Phases completed: [which phases they got through]
- Total transmissions: [count]

**GRADE: [A/B/C/D/F]**

**GRADING RUBRIC:**
- A (Excellent): Near-perfect phraseology, all mandatory readbacks correct, proper call structure, good mic discipline
- B (Good): Minor phraseology errors, all safety-critical readbacks correct, mostly proper structure
- C (Satisfactory): Several phraseology errors, may have missed a non-critical readback, but got safety items right
- D (Needs Work): Missed safety-critical readbacks, significant phraseology errors, confusion about procedures
- F (Unsafe): Wrong runway/altitude readback not caught, missing hold short readback, dangerous errors

**WHAT YOU DID WELL:**
[List 2-4 specific things they did correctly with exact quotes from their transmissions]

**ERRORS & CORRECTIONS:**
[For each error, list:]
1. [What they said] → [What they should have said]
   Why: [Brief explanation of the standard]

**PHRASEOLOGY SCORE: [X/10]**
- Callsign usage: [correct/needs work]
- Number pronunciation: [correct/needs work]
- Readback completeness: [correct/needs work]
- Call structure (who-who-where-what): [correct/needs work]
- Standard phrases: [correct/needs work]

**SAFETY SCORE: [X/10]**
- Hold short readbacks: [correct/missed]
- Runway readbacks: [correct/missed]
- Altitude readbacks: [correct/missed]
- Squawk readbacks: [correct/missed]

**TIPS FOR NEXT SESSION:**
[2-3 specific, actionable tips based on their weakest areas]

**RECOMMENDED STUDY:**
[Point them to specific AIM sections or topics to review]
`;

// ═══════════════════════════════════════════════════════════════
// SERVER LOGIC
// ═══════════════════════════════════════════════════════════════

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { messages: [], startTime: Date.now() });
  }
  return sessions.get(sessionId);
}

async function chatWithAzure(messages, maxTokens = 400) {
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
      max_tokens: maxTokens,
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

// Main ATC chat endpoint
app.post('/api/atc', async (req, res) => {
  const { message, sessionId = 'default' } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });

  const session = getSession(sessionId);
  session.messages.push({ role: 'user', content: message });

  if (session.messages.length > 50) {
    session.messages = session.messages.slice(-50);
  }

  try {
    const atcReply = await chatWithAzure(session.messages);
    session.messages.push({ role: 'assistant', content: atcReply });

    // Strip the [RADIO] tag before sending to client (keep [DEBRIEF] for client to handle)
    const cleanReply = atcReply.replace(/^\[RADIO\]\s*/i, '');
    const isDebrief = atcReply.startsWith('[DEBRIEF]');

    res.json({ reply: cleanReply, isDebrief });
  } catch (err) {
    console.error('Azure OpenAI error:', err.message);
    res.status(500).json({ error: 'ATC communication failure' });
  }
});

// Request debrief/grade — also saves the full session to disk
app.post('/api/debrief', async (req, res) => {
  const { sessionId = 'default' } = req.body;
  const session = getSession(sessionId);

  if (session.messages.length === 0) {
    return res.json({ reply: 'No session to debrief. Start a radio session first.', isDebrief: true });
  }

  session.messages.push({ role: 'user', content: '[DEBRIEF]' });

  try {
    const debrief = await chatWithAzure(session.messages, 1500);
    session.messages.push({ role: 'assistant', content: debrief });

    const cleanReply = debrief.replace(/^\[DEBRIEF\]\s*/i, '');

    // Extract grade from debrief text
    const gradeMatch = cleanReply.match(/GRADE:\s*([A-F][+-]?)/i);
    session.debrief = cleanReply;
    session.grade = gradeMatch ? gradeMatch[1] : null;

    // Save to disk
    const filename = saveSession(sessionId, session);
    console.log(`Session saved: ${filename}`);

    res.json({ reply: cleanReply, isDebrief: true, grade: session.grade, filename });
  } catch (err) {
    console.error('Debrief error:', err.message);
    res.status(500).json({ error: 'Debrief generation failed' });
  }
});

// ── History endpoints ──

// List all past sessions (summaries)
app.get('/api/history', (req, res) => {
  const sessions = loadAllSessions();
  res.json({ sessions });
});

// Get full session detail (transcript + debrief)
app.get('/api/history/:filename', (req, res) => {
  const filepath = join(HISTORY_DIR, req.params.filename);
  if (!existsSync(filepath) || !req.params.filename.endsWith('.json')) {
    return res.status(404).json({ error: 'Session not found' });
  }
  try {
    const data = JSON.parse(readFileSync(filepath, 'utf-8'));
    // Check if audio exists for this session
    const audioPath = filepath.replace('.json', '.webm');
    data.hasAudio = existsSync(audioPath);
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to read session' });
  }
});

// Upload session audio recording (receives raw webm blob)
app.post('/api/upload-audio/:filename', express.raw({ type: 'audio/*', limit: '50mb' }), (req, res) => {
  const filename = req.params.filename;
  if (!filename.endsWith('.webm')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  // Sanitize — only allow filenames that match our session pattern
  if (!/^[\w\-]+\.webm$/.test(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filepath = join(HISTORY_DIR, filename);
  try {
    writeFileSync(filepath, req.body);
    console.log(`Audio saved: ${filename} (${(req.body.length / 1024).toFixed(0)} KB)`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Audio save error:', err.message);
    res.status(500).json({ error: 'Failed to save audio' });
  }
});

// Serve session audio files
app.get('/api/audio/:filename', (req, res) => {
  const filename = req.params.filename;
  if (!filename.endsWith('.webm')) {
    return res.status(400).json({ error: 'Invalid audio file' });
  }
  const filepath = join(HISTORY_DIR, filename);
  if (!existsSync(filepath)) {
    return res.status(404).json({ error: 'Audio not found' });
  }
  res.set('Content-Type', 'audio/webm');
  res.sendFile(filepath);
});

// ElevenLabs TTS endpoint
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
