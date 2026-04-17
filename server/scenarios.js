// ═══════════════════════════════════════════════════════════════
// DYNAMIC FLIGHT TRAINING SCENARIOS
// GPT generates unique, realistic scenarios using real airport data.
// Scenarios are never the same — different airports, weather, routes.
// ═══════════════════════════════════════════════════════════════

// Scenario types the user can pick from
const SCENARIO_TYPES = [
  // ── BEGINNER: Focused single-phase drills ──
  {
    id: 'taxi-only',
    name: 'Taxi Operations',
    icon: '1',
    difficulty: 'Beginner',
    category: 'Drills',
    description: 'Practice ATIS, then contact Ground for taxi clearance. Read back taxiway routes and hold short instructions. Focused on ground ops only.',
  },
  {
    id: 'takeoff-only',
    name: 'Takeoff Clearance',
    icon: '2',
    difficulty: 'Beginner',
    category: 'Drills',
    description: 'You\'re holding short of the runway. Contact Tower, get takeoff clearance, read back correctly. Practice "line up and wait" vs "cleared for takeoff".',
  },
  {
    id: 'landing-only',
    name: 'Landing & Tower Entry',
    icon: '3',
    difficulty: 'Beginner',
    category: 'Drills',
    description: 'You\'re 10 miles out. Contact Tower, report position, get sequencing and landing clearance. Practice pattern entry calls.',
  },
  {
    id: 'atis-clearance',
    name: 'ATIS & Clearance Delivery',
    icon: '4',
    difficulty: 'Beginner',
    category: 'Drills',
    description: 'Listen to ATIS, copy weather info, then contact Clearance Delivery for your VFR or IFR clearance. Practice the C-R-A-F-T readback.',
  },
  {
    id: 'readback-drill',
    name: 'Readback Trainer',
    icon: '5',
    difficulty: 'Beginner',
    category: 'Drills',
    description: 'ATC fires rapid instructions — altitudes, headings, frequencies, squawk codes. Read each one back correctly. Pure readback muscle memory.',
  },
  // ── INTERMEDIATE: Multi-phase realistic flows ──
  {
    id: 'vfr-departure',
    name: 'VFR Departure (Full)',
    icon: '6',
    difficulty: 'Intermediate',
    category: 'Scenarios',
    description: 'Full pre-departure flow: ATIS, Clearance, Ground taxi, Tower takeoff, handoff to Departure. The complete departure experience.',
  },
  {
    id: 'circuits',
    name: 'Circuit Work (Touch & Go)',
    icon: '7',
    difficulty: 'Intermediate',
    category: 'Scenarios',
    description: 'Taxi out, take off, fly the pattern, call Tower for touch-and-go, go around, and do it again. Multiple landing clearances.',
  },
  {
    id: 'arrival',
    name: 'Arrival & Full Stop',
    icon: '8',
    difficulty: 'Intermediate',
    category: 'Scenarios',
    description: 'You\'re inbound 20nm out. Contact Approach for vectors, get handed to Tower, receive landing clearance, then taxi to parking.',
  },
  {
    id: 'cross-country',
    name: 'Cross-Country Flight',
    icon: '9',
    difficulty: 'Intermediate',
    category: 'Scenarios',
    description: 'Depart one airport, get flight following from Center, navigate to a real destination within 100nm, and do the full arrival.',
  },
  {
    id: 'flight-following',
    name: 'VFR Flight Following',
    icon: '10',
    difficulty: 'Intermediate',
    category: 'Scenarios',
    description: 'You\'re airborne and want radar services. Request flight following from Approach/Center, handle frequency changes and traffic advisories.',
  },
  {
    id: 'go-around',
    name: 'Go-Around & Missed Approach',
    icon: '11',
    difficulty: 'Intermediate',
    category: 'Scenarios',
    description: 'On final and told to go around — or you decide to. Practice the go-around call, climb-out communication, and re-entry into the pattern.',
  },
  // ── ADVANCED: High workload & special situations ──
  {
    id: 'busy-pattern',
    name: 'Busy Traffic Pattern',
    icon: '12',
    difficulty: 'Advanced',
    category: 'Scenarios',
    description: 'Circuits on a packed Saturday. Sequencing behind multiple aircraft, extended downwinds, go-arounds, runway changes. High workload.',
  },
  {
    id: 'emergency',
    name: 'Engine Failure Emergency',
    icon: '13',
    difficulty: 'Advanced',
    category: 'Scenarios',
    description: 'Declare MAYDAY, squawk 7700, communicate position and souls on board under pressure. Get vectors back to the nearest runway.',
  },
  {
    id: 'ifr-departure',
    name: 'IFR Departure',
    icon: '14',
    difficulty: 'Advanced',
    category: 'Scenarios',
    description: 'File and pick up your IFR clearance. Full C-R-A-F-T readback, taxi, takeoff, fly a SID, and get handed off to Center. Instrument-rated pilots.',
  },
  {
    id: 'class-bravo',
    name: 'Class Bravo Transition',
    icon: '15',
    difficulty: 'Advanced',
    category: 'Scenarios',
    description: 'Request a Class Bravo transition through a major airport\'s airspace. Strict altitude/heading compliance, rapid frequency changes.',
  },
  {
    id: 'radio-failure',
    name: 'Radio Failure (NORDO)',
    icon: '16',
    difficulty: 'Advanced',
    category: 'Scenarios',
    description: 'Your radio partially fails mid-flight. Practice degraded comms, squawk 7600 procedures, and light gun signals awareness.',
  },
  {
    id: 'night-ops',
    name: 'Night Operations',
    icon: '17',
    difficulty: 'Advanced',
    category: 'Scenarios',
    description: 'Night VFR departure or arrival. Practice position reporting with limited visual references, proper lighting calls, and VASI/PAPI awareness.',
  },
  // ── SPECIALIZED ──
  {
    id: 'glider',
    name: 'Glider Operations',
    icon: '18',
    difficulty: 'Intermediate',
    category: 'Specialized',
    description: 'Aero tow, release, soar, and land. Glider-specific radio procedures and traffic pattern differences.',
  },
  {
    id: 'uncontrolled',
    name: 'Uncontrolled Airport (CTAF)',
    icon: '19',
    difficulty: 'Beginner',
    category: 'Specialized',
    description: 'No tower — it\'s all CTAF self-announce. Practice position calls on the common frequency. "Any traffic in the area please advise."',
  },
  {
    id: 'controlled-to-uncontrolled',
    name: 'Controlled → Uncontrolled',
    icon: '20',
    difficulty: 'Intermediate',
    category: 'Specialized',
    description: 'Depart a towered airport and fly to a non-towered field. Transition from ATC instructions to self-announce CTAF procedures.',
  },
];

// The prompt that generates a unique scenario via GPT
const SCENARIO_GENERATION_PROMPT = `You are a flight instructor creating a realistic training scenario for a student pilot practicing ATC radio communication.

Generate a UNIQUE, detailed scenario based on the following:
- Scenario type: {SCENARIO_TYPE}
- Airport: {AIRPORT} (use this specific airport with its REAL frequencies, runway numbers, taxiways, and procedures)
- Aircraft: {AIRCRAFT}

You must respond with ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "name": "Short scenario title",
  "aircraft": "Aircraft type",
  "briefing": {
    "airport": "ICAO code",
    "airportName": "Full airport name",
    "destination": "ICAO code or null if staying local",
    "destinationName": "Full name or null",
    "callsign": "Full radio callsign with phonetics (e.g. Cessna one-seven-two-Sierra-Papa)",
    "tailNumber": "N-number or registration",
    "flightType": "VFR or IFR",
    "mission": "One-line mission description",
    "altitude": "Planned altitude with reasoning",
    "route": "Route description",
    "squawk": "Assigned by ATC",
    "frequencies": {
      "atis": "freq or null",
      "clearance": "freq or null",
      "ground": "freq",
      "tower": "freq",
      "departure": "freq or null",
      "approach": "freq or null",
      "center": "freq or null",
      "dest_atis": "freq or null",
      "dest_approach": "freq or null",
      "dest_tower": "freq or null",
      "dest_ground": "freq or null"
    }
  },
  "pilotBrief": "Detailed briefing text for the student. Written in second person. Explain the mission, what radio calls they will need to make in order, example phraseology for the first call, and key things to remember. Include the correct frequencies they need to tune to at each step. Be specific to this airport — mention real runway numbers, taxiway letters, local procedures. 300-500 words.",
  "atcContext": "Instructions for the AI playing ATC. Describe the exact flow step by step (numbered), what to say at each step, what frequencies to simulate, what to listen for in readbacks, when to issue corrections. Include realistic details: specific runway, specific taxiways for this airport, wind conditions, traffic advisories. Also specify any special events (go-arounds, traffic conflicts, runway changes) to make the scenario engaging. 300-500 words.",
  "frequencyQuiz": [
    {"step": "Get weather", "correctFreq": "the ATIS frequency", "options": ["freq1", "freq2", "freq3", "freq4"]},
    {"step": "Request taxi", "correctFreq": "the ground frequency", "options": ["freq1", "freq2", "freq3", "freq4"]},
    {"step": "Takeoff clearance", "correctFreq": "the tower frequency", "options": ["freq1", "freq2", "freq3", "freq4"]}
  ]
}

CRITICAL RULES:
- Use REAL frequencies for this airport (look them up). Do NOT make up frequencies.
- Use REAL runway numbers and taxiway letters for this airport.
- Generate a random but realistic tail number.
- The frequencyQuiz should have 3-5 steps with 4 frequency options each (one correct, three plausible distractors from the airport).
- Make every scenario slightly different — vary the weather, active runway, wind direction, other traffic, special instructions.
- For cross-country, pick a real destination within 100nm of the departure airport.
- ALL frequencies must be realistic aviation band (118.0-136.975 MHz).`;

// Popular training airports with basic info (GPT fills in the real details)
const AIRPORTS = [
  { icao: 'KBOS', name: 'Boston Logan International', country: 'US' },
  { icao: 'CYYZ', name: 'Toronto Pearson International', country: 'CA' },
  { icao: 'KJFK', name: 'New York JFK', country: 'US' },
  { icao: 'KLAX', name: 'Los Angeles International', country: 'US' },
  { icao: 'KORD', name: 'Chicago O\'Hare', country: 'US' },
  { icao: 'KSFO', name: 'San Francisco International', country: 'US' },
  { icao: 'KATL', name: 'Atlanta Hartsfield-Jackson', country: 'US' },
  { icao: 'EGLL', name: 'London Heathrow', country: 'UK' },
  { icao: 'CYUL', name: 'Montreal Trudeau', country: 'CA' },
  { icao: 'KDEN', name: 'Denver International', country: 'US' },
  { icao: 'KSEA', name: 'Seattle-Tacoma', country: 'US' },
  { icao: 'KFLL', name: 'Fort Lauderdale', country: 'US' },
  { icao: 'CYKZ', name: 'Toronto Buttonville', country: 'CA' },
  { icao: 'KBED', name: 'Hanscom Field (Bedford)', country: 'US' },
  { icao: 'KPAO', name: 'Palo Alto Airport', country: 'US' },
  { icao: 'KFRG', name: 'Republic Airport (Farmingdale)', country: 'US' },
  { icao: 'KORL', name: 'Orlando Executive', country: 'US' },
  { icao: 'KVNY', name: 'Van Nuys Airport', country: 'US' },
];

const AIRCRAFT_TYPES = [
  'Cessna 172 Skyhawk',
  'Cessna 152',
  'Piper PA-28 Cherokee',
  'Piper PA-28 Warrior',
  'Diamond DA40',
  'Cirrus SR20',
  'Beechcraft Bonanza',
];

const GLIDER_TYPES = [
  'Schweizer SGS 2-33',
  'Grob 103 Twin Astir',
  'Schleicher ASK 21',
];

function getScenarioTypes() {
  return SCENARIO_TYPES;
}

function getAirports() {
  return AIRPORTS;
}

function buildGenerationPrompt(scenarioTypeId, airportIcao) {
  const type = SCENARIO_TYPES.find(t => t.id === scenarioTypeId);
  const airport = AIRPORTS.find(a => a.icao === airportIcao) || { icao: airportIcao, name: airportIcao };
  const isGlider = scenarioTypeId === 'glider';
  const aircraftList = isGlider ? GLIDER_TYPES : AIRCRAFT_TYPES;
  const aircraft = aircraftList[Math.floor(Math.random() * aircraftList.length)];

  return SCENARIO_GENERATION_PROMPT
    .replace('{SCENARIO_TYPE}', `${type.name} (${type.description})`)
    .replace('{AIRPORT}', `${airport.icao} — ${airport.name}`)
    .replace('{AIRCRAFT}', aircraft);
}

// Build the system prompt injection for an active scenario
function getScenarioContext(scenario) {
  if (!scenario) return '';

  const b = scenario.briefing;
  const freqLines = Object.entries(b.frequencies)
    .filter(([, v]) => v && v !== 'null')
    .map(([k, v]) => `- ${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${v}`)
    .join('\n');

  return `
## ACTIVE SCENARIO: ${scenario.name}
- Aircraft: ${scenario.aircraft}
- Callsign: ${b.callsign}
- Tail number: ${b.tailNumber}
- Airport: ${b.airport} (${b.airportName})
${b.destination ? `- Destination: ${b.destination} (${b.destinationName})` : ''}
- Flight type: ${b.flightType}
- Mission: ${b.mission}
- Planned altitude: ${b.altitude}
- Route: ${b.route}

## FREQUENCIES:
${freqLines}

## SCENARIO-SPECIFIC ATC INSTRUCTIONS:
${scenario.atcContext}

IMPORTANT: Stay within this scenario. Guide them through "${scenario.name}" at ${b.airport}. Use the REAL frequencies listed above. Reference correct runways and taxiways for this airport.
`;
}

export { SCENARIO_TYPES, AIRPORTS, getScenarioTypes, getAirports, buildGenerationPrompt, getScenarioContext };
