// ═══════════════════════════════════════════════════════════════
// DYNAMIC WORLD GENERATION
// Generates scenario-specific 3D cockpit environments via World Labs.
// Each scene generates once, then is cached as a .spz file forever.
// ═══════════════════════════════════════════════════════════════

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ASSETS_DIR = join(__dirname, '..', 'client', 'assets', 'worlds');
const WORLDLABS_API_KEY = process.env.WORLDLABS_API_KEY;
const WORLDLABS_BASE = 'https://api.worldlabs.ai';

// ── Scene definitions ──
// Each scene maps to a specific cockpit viewpoint for different training phases.
// The prompt must be first-person from the pilot's left seat.

const SCENE_DEFINITIONS = {
  // Default cockpit (already generated as cockpit.spz)
  'cockpit-default': {
    file: 'cockpit.spz',
    legacyPath: join(__dirname, '..', 'client', 'assets', 'cockpit.spz'),
    model: 'marble-1.1',
    prompt: `The scene is a photorealistic, first-person VR cockpit view from the pilot's left seat inside a Cessna 172 Skyhawk private aircraft, rendered with extreme detail and accuracy to a real general-aviation cockpit. The overall tone is immersive and professional, capturing the essence of flight preparation and execution. The pilot's hands firmly grip the black control yoke, exhibiting realistic skin texture and visible veins. The instrument panel, directly in front of the pilot, is fully analog with crisp, readable gauges, including an airspeed indicator, artificial horizon, altimeter, heading indicator, turn coordinator, vertical speed indicator, tachometer, fuel gauges, oil pressure, and ammeter. To the right of the main instrument panel, a modern Garmin GNS 430 and a radio stack are prominently displayed. Above the pilot, a circuit breaker panel is visible, while the throttle quadrant, equipped with black knobs for throttle, mixture, carb heat, and a friction lock, is positioned to the pilot's right. Rudder pedals are clearly visible at the bottom of the scene. Soft natural daylight floods through the large curved windshield, revealing a clear blue sky and a distant green landscape below, indicating an altitude of approximately 3000 feet. The detailed leather seats show subtle wear, and sun visors are positioned above the windshield. A checklist clipboard rests nearby, and a headset hangs on a hook on the right seat. Overhead switches and lights, complete with realistic labels and wear, are also visible. High-fidelity materials are evident throughout, with accurate reflections on glass and metal surfaces, and subtle dust and fingerprints on the panel. The scene maintains a cinematic depth of field, perfect VR scale and perspective, and ultra-sharp 8K detail with photorealistic textures and natural lighting.`,
  },

  // Parked at the ramp — for ATIS, clearance delivery, pre-taxi
  'ramp-parked': {
    file: 'ramp-parked.spz',
    model: 'marble-1.1-plus',
    prompt: `Photorealistic first-person VR view from the pilot's left seat of a Cessna 172 Skyhawk parked on a general aviation ramp at a busy towered airport. The aircraft is stationary, engine idling, propeller spinning at low RPM with visible motion blur. Through the large curved windshield, the ramp area is clearly visible: several other light aircraft (Cessna, Piper) are parked in tie-down spots with chocks and tie-down ropes. A fuel truck is parked nearby. Painted taxi lines (yellow) lead from the ramp toward a taxiway. A windsock is visible on a nearby hangar, showing a light breeze. The airport terminal building and several hangars are in the background. A control tower is visible in the distance, a tall structure with a glass cab at the top. The instrument panel is fully visible with all six-pack gauges, radio stack showing frequencies, and the Garmin GNS 430 GPS unit. The throttle is at idle, mixture rich (full in), magnetos on BOTH. A checklist on a kneeboard sits on the pilot's lap showing "BEFORE TAXI" checklist. Bright daytime conditions, partly cloudy sky, excellent visibility. The scene has cinematic depth, VR-accurate scale and perspective, ultra-realistic textures with fingerprints on glass, scuffed paint on the yoke, and worn leather seats.`,
  },

  // Holding short of runway — for tower contact, takeoff clearance
  'holding-short': {
    file: 'holding-short.spz',
    model: 'marble-1.1-plus',
    prompt: `Photorealistic first-person VR view from the pilot's left seat of a Cessna 172 Skyhawk at the hold short line of an active runway at a towered airport. The aircraft is stopped with brakes applied, engine running at idle, propeller spinning. Through the windshield, the runway stretches ahead — a wide, well-maintained asphalt surface with white center line markings, runway numbers painted at the threshold, and edge lights visible. The hold short line (two solid and two dashed yellow lines) is clearly visible on the ground just ahead of the aircraft's nose. A runway hold position sign (red with white numbers like "22L") is visible to the left side. The taxiway behind curves away. Looking left through the side window, the runway environment is visible — approach lights, PAPI lights on the left side, and the full length of the runway disappearing into the distance. Other aircraft may be visible on approach or in the pattern. The instrument panel shows all gauges, transponder set to an assigned squawk code, radio stack tuned to tower frequency. The flaps are set to 10 degrees (first notch). Run-up is complete. Bright daytime, some cumulus clouds at 4000 feet. Ultra-realistic VR perspective, detailed cockpit textures, accurate lighting with sun casting shadows across the instrument panel.`,
  },

  // On final approach — for landing scenarios
  'final-approach': {
    file: 'final-approach.spz',
    model: 'marble-1.1-plus',
    prompt: `Photorealistic first-person VR view from the pilot's left seat of a Cessna 172 Skyhawk on a 3-mile final approach to a runway at a towered airport. The aircraft is descending at approximately 500 feet AGL, airspeed 65 knots, flaps full (40 degrees). Through the large curved windshield, the runway is clearly visible ahead and below, growing larger as we approach — white threshold markings, runway numbers, center line, and touchdown zone markings are all visible. PAPI lights are visible on the left side of the runway showing two red, two white (on glidepath). Approach lights (ALSF or MALSR) lead up to the runway threshold. The airport environment is visible — taxiways, terminal buildings, hangars, a control tower, other aircraft on the ground. Green fields and residential areas surround the airport. The instrument panel shows: airspeed indicator reading 65 KIAS, altimeter showing approximately 500 feet above field elevation, VSI showing -500 fpm descent, heading indicator aligned with the runway heading. The pilot's right hand is on the throttle (partially pulled back), left hand on the yoke. The landscape has a slight nose-down perspective. Late afternoon golden light, some scattered clouds above. Ultra-realistic VR cockpit detail, accurate instrument readings, cinematic lighting.`,
  },

  // Taxiing on taxiway — for taxi operations
  'taxiing': {
    file: 'taxiing.spz',
    model: 'marble-1.1-plus',
    prompt: `Photorealistic first-person VR view from the pilot's left seat of a Cessna 172 Skyhawk taxiing on a taxiway at a busy towered airport. The aircraft is moving slowly along a taxiway — yellow center line markings are visible on the gray asphalt surface, with blue taxiway edge lights on both sides. Taxiway signs are visible: blue signs with white letters showing taxiway designations (like "A", "C"), and yellow direction signs pointing to runways and other taxiways. Through the windshield, the taxiway curves gently ahead. To the left, the main runway is partially visible across a grass strip, with runway hold position markings and signs visible ahead. Other aircraft are visible — a Boeing 737 taxiing on a parallel taxiway, a Piper Cherokee waiting at an intersection. Airport buildings, hangars, and the control tower are visible in the mid-distance. The instrument panel shows the compass/heading indicator, the pilot's feet are on the rudder pedals (feet visible at bottom of frame) steering the nosewheel. Brakes are intermittently applied. The throttle is at a low taxi setting (1000 RPM on the tachometer). Bright midday conditions, clear sky. Ultra-realistic textures including tire marks on the taxiway, heat shimmer from jet exhaust in the distance, and accurate airport signage.`,
  },

  // Cruise flight — for cross-country, flight following
  'cruise': {
    file: 'cruise.spz',
    model: 'marble-1.1-plus',
    prompt: `Photorealistic first-person VR view from the pilot's left seat of a Cessna 172 Skyhawk in cruise flight at 4,500 feet MSL. The aircraft is in stable, wings-level flight. Through the large curved windshield, a vast landscape stretches to the horizon — a patchwork of green farmland, forests, small towns, winding rivers, and country roads far below. The horizon line is clearly visible with a slight haze in the distance. Scattered cumulus clouds float at roughly the same altitude, some casting shadows on the ground below. The sky above is brilliant blue. The instrument panel shows: airspeed indicator at 110 KIAS, altimeter at 4,500 feet, heading indicator showing a specific heading, artificial horizon showing wings level, VSI at zero, tachometer at 2,300 RPM. The Garmin GNS 430 shows a magenta GPS course line. The throttle is set for cruise power, mixture slightly leaned. A sectional chart is visible on the pilot's kneeboard, folded to show the local area. The right seat has a headset hanging on it and a flight bag. Bright afternoon sun from the left, creating instrument panel shadows. Ultra-realistic cockpit detail with worn leather, scratched plexiglass windshield, and accurate VR scale and depth.`,
  },

  // Night operations — for night scenarios
  'night-cockpit': {
    file: 'night-cockpit.spz',
    model: 'marble-1.1-plus',
    prompt: `Photorealistic first-person VR view from the pilot's left seat of a Cessna 172 Skyhawk flying at night, approximately 2,000 feet AGL on approach to a lit airport. The cockpit is dramatically lit by the soft red/orange glow of instrument panel backlighting — all six-pack gauges are clearly readable with their internal lighting. The Garmin GNS 430 and radio stack emit a cool blue-green glow. The overhead panel has small red dome lights. Through the windshield, the night scene is visible: the airport ahead is identifiable by its rotating beacon (green and white flashes), runway edge lights forming two parallel lines of white lights, approach lights leading to the threshold, blue taxiway lights, and the amber/green glow of the terminal area. City lights and roads with car headlights are visible in the surrounding area. Stars are faintly visible in the dark sky above. The PAPI lights show two red and two white. The pilot's hands are visible on the yoke, illuminated by the panel glow. The instrument panel shows: altimeter at 2,000 feet, airspeed at 90 KIAS. The overall mood is focused and atmospheric. Ultra-realistic lighting with accurate light falloff, reflections on the windshield interior, and the characteristic intimacy of night flying in a small aircraft.`,
  },

  // Emergency — dramatic scene
  'emergency': {
    file: 'emergency.spz',
    model: 'marble-1.1',
    prompt: `Photorealistic first-person VR view from the pilot's left seat of a Cessna 172 Skyhawk in an emergency situation — the engine has just failed. The propeller is windmilling (barely spinning). Through the windshield, the aircraft is at approximately 3,000 feet with a nose-slightly-down pitch attitude, gliding. The landscape below shows a mix of fields, roads, and a small airport visible in the distance at roughly 2 o'clock position. The instrument panel shows critical readings: airspeed at 68 KIAS (best glide speed), altimeter unwinding through 3,000 feet, VSI showing -700 fpm descent, RPM near zero on tachometer, oil pressure gauge dropping. The transponder display shows 7700 being dialed in. The pilot's left hand grips the yoke firmly, right hand is reaching for the radio stack. The overall atmosphere is tense but controlled — bright daylight, good visibility, but the silence of the dead engine creates urgency. Some scattered clouds at 5,000 feet. Fields below could serve as emergency landing options. Ultra-realistic VR detail with cockpit stress indicators: slightly fogged windshield edges, the pilot's knuckles white on the yoke grip.`,
  },
};

// Map scenario types to which worlds they need
const SCENARIO_WORLD_MAP = {
  'taxi-only':                ['ramp-parked', 'taxiing'],
  'takeoff-only':             ['holding-short'],
  'landing-only':             ['final-approach'],
  'atis-clearance':           ['ramp-parked'],
  'readback-drill':           ['cockpit-default'],
  'vfr-departure':            ['ramp-parked', 'taxiing', 'holding-short'],
  'circuits':                 ['holding-short', 'final-approach'],
  'arrival':                  ['final-approach', 'taxiing'],
  'cross-country':            ['ramp-parked', 'cruise'],
  'flight-following':         ['cruise'],
  'go-around':                ['final-approach'],
  'busy-pattern':             ['holding-short', 'final-approach'],
  'emergency':                ['emergency'],
  'ifr-departure':            ['ramp-parked', 'holding-short'],
  'class-bravo':              ['cruise'],
  'radio-failure':            ['cruise'],
  'night-ops':                ['night-cockpit'],
  'glider':                   ['cockpit-default'],
  'uncontrolled':             ['ramp-parked', 'final-approach'],
  'controlled-to-uncontrolled': ['ramp-parked', 'cruise'],
};

// ── API helpers ──

async function generateWorld(sceneId) {
  const scene = SCENE_DEFINITIONS[sceneId];
  if (!scene) throw new Error(`Unknown scene: ${sceneId}`);

  const spzPath = join(ASSETS_DIR, scene.file);

  // Check legacy path for cockpit-default
  if (scene.legacyPath && existsSync(scene.legacyPath)) {
    console.log(`  [worlds] ${sceneId}: found at legacy path`);
    return { sceneId, path: `/assets/cockpit.spz`, cached: true };
  }

  if (existsSync(spzPath)) {
    console.log(`  [worlds] ${sceneId}: cached`);
    return { sceneId, path: `/assets/worlds/${scene.file}`, cached: true };
  }

  if (!WORLDLABS_API_KEY) {
    console.log(`  [worlds] ${sceneId}: no API key — skipping`);
    return { sceneId, path: null, cached: false, error: 'no_api_key' };
  }

  console.log(`  [worlds] ${sceneId}: generating via Marble (${scene.model})...`);

  try {
    // Step 1: Submit generation
    const genRes = await fetch(`${WORLDLABS_BASE}/marble/v1/worlds:generate`, {
      method: 'POST',
      headers: {
        'WLT-Api-Key': WORLDLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        display_name: `VRPilotATC - ${sceneId}`,
        model: scene.model,
        world_prompt: { type: 'text', text_prompt: scene.prompt },
      }),
    });

    if (!genRes.ok) {
      const err = await genRes.text();
      throw new Error(`Generation request failed (${genRes.status}): ${err}`);
    }

    const genData = await genRes.json();
    const operationId = genData.name || genData.operation_id || genData.id;
    if (!operationId) throw new Error(`No operation ID: ${JSON.stringify(genData)}`);

    console.log(`  [worlds] ${sceneId}: operation ${operationId}`);

    // Step 2: Poll
    let result = null;
    for (let i = 0; i < 120; i++) {
      await new Promise(r => setTimeout(r, 5000));

      const pollRes = await fetch(`${WORLDLABS_BASE}/marble/v1/operations/${operationId}`, {
        headers: { 'WLT-Api-Key': WORLDLABS_API_KEY },
      });
      if (!pollRes.ok) continue;

      const poll = await pollRes.json();
      if (poll.error) throw new Error(`Generation failed: ${JSON.stringify(poll.error)}`);

      if (i % 6 === 0) {
        console.log(`  [worlds] ${sceneId}: ${poll.done ? 'DONE' : 'generating'} (${i * 5}s)`);
      }

      if (poll.done) {
        if (poll.response) {
          result = poll.response;
        } else if (poll.metadata?.world_id) {
          const wRes = await fetch(`${WORLDLABS_BASE}/marble/v1/worlds/${poll.metadata.world_id}`, {
            headers: { 'WLT-Api-Key': WORLDLABS_API_KEY },
          });
          if (wRes.ok) result = await wRes.json();
        }
        break;
      }
    }

    if (!result) throw new Error('Timed out after 10 minutes');

    // Step 3: Download .spz
    const spzUrls = result.assets?.splats?.spz_urls || result.splats?.spz_urls;
    if (!spzUrls) throw new Error('No .spz URLs in response');

    const dlUrl = spzUrls.full_res || spzUrls['500k'] || spzUrls['100k'] || Object.values(spzUrls)[0];
    const dlRes = await fetch(dlUrl);
    if (!dlRes.ok) throw new Error(`Download failed (${dlRes.status})`);

    const buf = await dlRes.arrayBuffer();
    mkdirSync(ASSETS_DIR, { recursive: true });
    writeFileSync(spzPath, Buffer.from(buf));

    const sizeMB = (buf.byteLength / 1024 / 1024).toFixed(1);
    console.log(`  [worlds] ${sceneId}: saved ${scene.file} (${sizeMB} MB)`);

    return { sceneId, path: `/assets/worlds/${scene.file}`, cached: false };
  } catch (err) {
    console.error(`  [worlds] ${sceneId}: error — ${err.message}`);
    return { sceneId, path: null, cached: false, error: err.message };
  }
}

// Get the list of worlds needed for a scenario type, and their status
function getWorldsForScenario(scenarioTypeId) {
  const sceneIds = SCENARIO_WORLD_MAP[scenarioTypeId] || ['cockpit-default'];
  return sceneIds.map(sceneId => {
    const scene = SCENE_DEFINITIONS[sceneId];
    if (!scene) return { sceneId, path: null, ready: false };

    const spzPath = join(ASSETS_DIR, scene.file);
    const legacyReady = scene.legacyPath && existsSync(scene.legacyPath);
    const ready = legacyReady || existsSync(spzPath);
    const path = legacyReady ? '/assets/cockpit.spz' : `/assets/worlds/${scene.file}`;

    return { sceneId, path: ready ? path : null, ready };
  });
}

// Generate all missing worlds for a scenario (can run in background)
async function ensureWorldsForScenario(scenarioTypeId) {
  const sceneIds = SCENARIO_WORLD_MAP[scenarioTypeId] || ['cockpit-default'];
  const results = [];

  for (const sceneId of sceneIds) {
    const result = await generateWorld(sceneId);
    results.push(result);
  }

  return results;
}

// List all available scenes and their cache status
function listAllScenes() {
  return Object.entries(SCENE_DEFINITIONS).map(([id, scene]) => {
    const spzPath = join(ASSETS_DIR, scene.file);
    const legacyReady = scene.legacyPath && existsSync(scene.legacyPath);
    const ready = legacyReady || existsSync(spzPath);
    return { id, file: scene.file, model: scene.model, ready };
  });
}

export {
  SCENE_DEFINITIONS,
  SCENARIO_WORLD_MAP,
  generateWorld,
  getWorldsForScenario,
  ensureWorldsForScenario,
  listAllScenes,
};
