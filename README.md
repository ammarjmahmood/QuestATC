# QuestATC

WebXR ATC radio communication trainer for student pilots on Meta Quest 3.

Practice talking to Air Traffic Control in VR — request ATIS, get clearances, taxi instructions, and takeoff clearance using proper radio phraseology. An AI agent plays the role of ATC tower, responding with realistic FAA-standard communications.

## Features

- **WebXR cockpit** — 3D cockpit view with instruments, runway, and airport environment
- **Push-to-talk** — Hold Quest trigger (or spacebar on desktop) to transmit, just like a real radio
- **AI ATC agent** — Azure OpenAI powered controller that uses proper phraseology, squawk codes, ATIS, taxi instructions
- **Voice I/O** — Speech recognition for pilot voice, ElevenLabs TTS with radio filter for ATC voice
- **Radio effects** — PTT click, static, bandpass filter on ATC audio for realism

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

Required:
- `AZURE_OPENAI_ENDPOINT` — Your Azure OpenAI resource URL
- `AZURE_OPENAI_API_KEY` — Azure OpenAI API key
- `AZURE_OPENAI_DEPLOYMENT` — Deployment name (default: `gpt-4o`)

Optional:
- `ELEVENLABS_API_KEY` — For voice TTS (works without it, just text-only)
- `ELEVENLABS_VOICE_ID` — Voice to use (default: Adam)

## Run

```bash
npm start
```

The server prints your local IP. On Quest 3, open the browser and go to that IP (e.g. `http://192.168.1.x:3000`).

Hit **ENTER VR** for immersive mode. Use the right trigger as push-to-talk.

## Gaussian Splat Cockpit (planned)

The current cockpit is a placeholder geometry. To add a World Labs gaussian splat:
1. Generate cockpit scene in World Labs (Spark model)
2. Export as `.splat` or `.ply` file
3. Place in `client/assets/cockpit.splat`
4. The loader will pick it up automatically (TODO: integrate splat renderer)

## Architecture

```
server/index.js  — Express server, Azure OpenAI proxy, ElevenLabs TTS proxy
client/index.html — WebXR app (Three.js), cockpit scene, PTT, speech recognition
```
