// World Labs Cockpit Generator
// Generates a Cessna 172 cockpit gaussian splat on first run, saves it locally.
// Skips generation if cockpit.spz already exists.

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ASSETS_DIR = join(__dirname, '..', 'client', 'assets');
const COCKPIT_SPZ = join(ASSETS_DIR, 'cockpit.spz');
const WORLDLABS_API_KEY = process.env.WORLDLABS_API_KEY;
const WORLDLABS_BASE = 'https://api.worldlabs.ai';

const COCKPIT_PROMPT = `The scene is a photorealistic, first-person VR cockpit view from the pilot's left seat inside a Cessna 172 Skyhawk private aircraft, rendered with extreme detail and accuracy to a real general-aviation cockpit. The overall tone is immersive and professional, capturing the essence of flight preparation and execution. The pilot's hands firmly grip the black control yoke, exhibiting realistic skin texture and visible veins. The instrument panel, directly in front of the pilot, is fully analog with crisp, readable gauges, including an airspeed indicator, artificial horizon, altimeter, heading indicator, turn coordinator, vertical speed indicator, tachometer, fuel gauges, oil pressure, and ammeter. To the right of the main instrument panel, a modern Garmin GNS 430 and a radio stack are prominently displayed. Above the pilot, a circuit breaker panel is visible, while the throttle quadrant, equipped with black knobs for throttle, mixture, carb heat, and a friction lock, is positioned to the pilot's right. Rudder pedals are clearly visible at the bottom of the scene. Soft natural daylight floods through the large curved windshield, revealing a clear blue sky and a distant green landscape below, indicating an altitude of approximately 3000 feet. The detailed leather seats show subtle wear, and sun visors are positioned above the windshield. A checklist clipboard rests nearby, and a headset hangs on a hook on the right seat. Overhead switches and lights, complete with realistic labels and wear, are also visible. High-fidelity materials are evident throughout, with accurate reflections on glass and metal surfaces, and subtle dust and fingerprints on the panel. The scene maintains a cinematic depth of field, perfect VR scale and perspective, and ultra-sharp 8K detail with photorealistic textures and natural lighting.`;

async function generateCockpit() {
  // Check if already generated
  if (existsSync(COCKPIT_SPZ)) {
    console.log('  Cockpit splat already exists — skipping generation');
    return true;
  }

  if (!WORLDLABS_API_KEY) {
    console.log('  WORLDLABS_API_KEY not set — skipping cockpit generation');
    console.log('  (Using placeholder cockpit geometry)');
    return false;
  }

  console.log('  Generating cockpit via World Labs (marble-1.1)...');
  console.log('  This takes 1-5 minutes on first run. Hang tight.\n');

  try {
    // Step 1: Submit generation request
    const genRes = await fetch(`${WORLDLABS_BASE}/marble/v1/worlds:generate`, {
      method: 'POST',
      headers: {
        'WLT-Api-Key': WORLDLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        display_name: 'Cessna 172 Cockpit - VRPilotATC',
        model: 'marble-1.1',
        world_prompt: {
          type: 'text',
          text_prompt: COCKPIT_PROMPT,
        },
      }),
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      throw new Error(`Generation request failed (${genRes.status}): ${err}`);
    }

    const genData = await genRes.json();
    const operationId = genData.name || genData.operation_id || genData.id;

    if (!operationId) {
      throw new Error(`No operation ID in response: ${JSON.stringify(genData)}`);
    }

    console.log(`  Operation ID: ${operationId}`);
    console.log('  Polling for completion...');

    // Step 2: Poll until done
    let result = null;
    const maxAttempts = 120; // 10 minutes max (5s intervals)
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, 5000)); // 5 second intervals

      const pollRes = await fetch(`${WORLDLABS_BASE}/marble/v1/operations/${operationId}`, {
        headers: { 'WLT-Api-Key': WORLDLABS_API_KEY },
      });

      if (!pollRes.ok) {
        console.log(`  Poll error (${pollRes.status}), retrying...`);
        continue;
      }

      const pollData = await pollRes.json();
      const status = pollData.metadata?.progress?.status || 'UNKNOWN';

      if (i % 6 === 0) { // Log every 30 seconds
        console.log(`  Status: ${status} (${(i * 5)}s elapsed)`);
      }

      if (pollData.done) {
        if (status === 'SUCCEEDED') {
          result = pollData.response;
          break;
        } else {
          throw new Error(`Generation failed with status: ${status}`);
        }
      }
    }

    if (!result) {
      throw new Error('Generation timed out after 10 minutes');
    }

    console.log(`  Generation complete!`);
    console.log(`  World ID: ${result.id}`);
    if (result.world_marble_url) {
      console.log(`  View online: ${result.world_marble_url}`);
    }

    // Step 3: Download the .spz file (use full_res for best quality, fall back to 500k)
    const spzUrls = result.assets?.splats?.spz_urls;
    if (!spzUrls) {
      throw new Error('No .spz URLs in response');
    }

    const downloadUrl = spzUrls.full_res || spzUrls['500k'] || spzUrls['100k'];
    console.log(`  Downloading cockpit.spz...`);

    const dlRes = await fetch(downloadUrl);
    if (!dlRes.ok) {
      throw new Error(`Download failed (${dlRes.status})`);
    }

    const arrayBuf = await dlRes.arrayBuffer();
    mkdirSync(ASSETS_DIR, { recursive: true });
    writeFileSync(COCKPIT_SPZ, Buffer.from(arrayBuf));

    const sizeMB = (arrayBuf.byteLength / 1024 / 1024).toFixed(1);
    console.log(`  Saved cockpit.spz (${sizeMB} MB)`);
    console.log('  Cockpit will load automatically in WebXR.\n');

    return true;
  } catch (err) {
    console.error(`  World Labs error: ${err.message}`);
    console.log('  Continuing with placeholder cockpit geometry.\n');
    return false;
  }
}

export { generateCockpit };
