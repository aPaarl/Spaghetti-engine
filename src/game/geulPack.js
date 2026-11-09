// ============================================================================
// Game pack: "Untangle the Geul"
// ============================================================================
// A game pack is plain data: the rounds, the concept cards, the roles with
// their knowledge cards, the measures, the event cards and the scoring
// targets. The game engine (gameEngine.js) reads it; nothing in this file is
// code. A new case is a new pack with the same shape.
//
// The case follows the Geul example model (12 concepts, 20 causal
// relationships) built for Limburg: flooding in Valkenburg, low flows in dry
// summers, and three measures. Card ids are the concept ids of that model, so
// a team's map can be compared with it.

export const GEUL_PACK = {
  packVersion: 1,
  id: "geul-v1",
  title: "Untangle the Geul",
  language: "en",
  intro:
    "The Geul is a small stream in South Limburg. In July 2021 it flooded the town of Valkenburg; in dry summers parts of it almost run dry. " +
    "As a team you build a map of what drives both problems, then look for measures that help every stakeholder. You win together.",
  targetScore: 45,
  budget: 6,

  // Concept cards. A card added to the map becomes a concept that carries the
  // card id, so the game can find it whatever the team renames it to.
  concepts: [
    { id: "REGEN", name: "Heavy rain", module: "Climate", hint: "How often and how hard it rains extremely, as in July 2021." },
    { id: "DROOG", name: "Dry summers", module: "Climate", hint: "How often long, dry and warm periods occur." },
    { id: "BOUW", name: "Building close to the stream", module: "Land use", hint: "Houses, hotels and roads in the Geul valley." },
    { id: "BELGIE", name: "Water from Belgium", module: "Water", hint: "Rain water that flows into the Geul from the Belgian part of the catchment." },
    { id: "HEUVEL", name: "Fast runoff from the hills", module: "Water", hint: "Rain that does not soak into the ground but runs over fields, roads and roofs to the stream." },
    { id: "BODEM", name: "Water in the soil", module: "Water", hint: "Groundwater that keeps feeding the Geul in summer." },
    { id: "OVER", name: "Flooding in Valkenburg", module: "Goals", hint: "Chance of and damage from flooding. Goal: as low as possible." },
    { id: "DROOGVAL", name: "Geul running dry", module: "Goals", hint: "Too little water in the stream in summer. Goal: as low as possible." },
    { id: "NATUUR", name: "Nature in the Geul valley", module: "Goals", hint: "Plants and animals in and along the stream. Goal: as high as possible." },
    { id: "VAST", name: "Water retention in the hills", module: "Measures", hint: "Buffers, field margins and vegetation, in the Netherlands and Belgium, so rain runs off more slowly." },
    { id: "RUIMTE", name: "Room for the Geul", module: "Measures", hint: "Meadows in the valley may flood at high water, so the water is stored there for a while." },
    { id: "MUUR", name: "Higher walls in Valkenburg", module: "Measures", hint: "Walls and barriers along the stream in the town centre." },
  ],

  // The goal concepts and the direction that counts as better.
  goals: [
    { card: "OVER", better: -1 },
    { card: "DROOGVAL", better: -1 },
    { card: "NATUUR", better: 1 },
  ],

  // Roles. Their knowledge cards are printed on paper and stay private; the
  // interest is the concept each role wants to move, in the direction given.
  roles: [
    { id: "hydro", name: "Water board hydrologist", interest: "OVER", better: -1, knows: "Discharge from Belgium, runoff from the hills",
      cards: [
        "Heavy rain in the Belgian part of the catchment sends a lot of water into the Geul.",
        "In 2021 most of the flood water in Valkenburg came from Belgium.",
        "Fast runoff from the hills adds to the flood peak in Valkenburg.",
        "Retaining water upstream, also in Belgium, lowers the discharge from Belgium.",
        "Meadows that may flood upstream store water and lower the peak in Valkenburg.",
      ] },
    { id: "muni", name: "Municipality of Valkenburg", interest: "OVER", better: -1, knows: "Building near the stream, flood walls",
      cards: [
        "More buildings in the valley means more flood damage.",
        "Higher walls protect the town centre against flooding.",
        "Building near the stream raises the water level in the stream. (Is this true? Discuss.)",
        "Higher walls push the flood water further downstream. (Where does that go in your map?)",
      ] },
    { id: "farmer", name: "Farmer in the hills", interest: "BODEM", better: 1, knows: "Soil moisture, dry summers, water retention on farmland",
      cards: [
        "Some of the heavy rain soaks into the ground and recharges groundwater.",
        "Long dry summers dry out the soil and lower the groundwater.",
        "Water that runs off quickly does not soak into the soil.",
        "Buffers, field margins and vegetation slow down runoff from the hills.",
        "Water held in the hills has time to soak into the ground.",
      ] },
    { id: "nature", name: "Nature organisation", interest: "NATUUR", better: 1, knows: "Low flows, room for the river, effects of walls on the stream",
      cards: [
        "In dry summers the Geul carries little water.",
        "Groundwater keeps feeding the Geul in summer.",
        "When the Geul runs dry, fish and plants in the stream suffer.",
        "Room for the river creates wet meadows that are good for nature.",
        "Walls squeeze the stream into a narrow channel.",
      ] },
    { id: "resident", name: "Resident of Valkenburg", interest: "OVER", better: -1, knows: "Heavy rain events, living near the stream",
      cards: [
        "During heavy rain, water runs quickly off fields, roads and roofs.",
        "Paved surfaces let rain run off quickly.",
        "Since the walls went up, new homes are being built close to the stream.",
        "After a dry spell the soil is hard, and heavy rain runs off faster. (Which relationship is this?)",
      ] },
  ],

  // Measure cards and what each costs from the team's budget.
  measures: [
    { card: "VAST", cost: 2 },
    { card: "RUIMTE", cost: 3 },
    { card: "MUUR", cost: 2 },
  ],

  // Event cards for Round 5: a climate concept that the proposal must hold.
  events: [
    { id: "rain", title: "Heavier rain", text: "Heavy rain becomes more frequent. In your proposal, hold Heavy rain at full strength (the up arrow on the Scenarios tab).", card: "REGEN", value: 1 },
    { id: "dry", title: "Drier summers", text: "Long dry summers become the norm. In your proposal, hold Dry summers at full strength (the up arrow on the Scenarios tab).", card: "DROOG", value: 1 },
  ],

  rounds: [
    {
      id: "r1", title: "Ingredients", minutes: 25, tabs: ["network", "editor"],
      goal: "Agree on the concepts of your map and what each one means.",
      steps: [
        "Read the concept cards below and the knowledge cards in your hands. Which factors matter?",
        "Add the concepts you agree on, from a card or as a new concept of your own.",
        "Every concept must pass the up-or-down test: it can increase or decrease. Write a definition for each.",
        "Give every concept a module, for example Climate, Water, Goals or Measures.",
      ],
      checks: ["conceptCount", "allNamed", "uniqueNames", "allInModule", "noLookAlikeModules", "allDefined"],
      craft: { perDefinedConcept: 1, maxDefined: 14, cleanBonus: 3 },
    },
    {
      id: "r2", title: "Connections", minutes: 35, tabs: ["network", "editor"],
      goal: "Turn your knowledge cards into causal relationships.",
      steps: [
        "Play a knowledge card and propose a relationship: which concept changes which, and in what direction?",
        "Draw it on the Network tab. The Modeller reads the sentence in the Inspector aloud; one other player must agree.",
        "Choose the strength together: Weak, Moderate, Strong or Very strong. Your team has only two Very strong tokens.",
        "If you disagree, write both views in the relationship's Description.",
      ],
      checks: ["enoughEdges", "noIsolated", "noZeroWeights", "strengthBudget", "allDescribed"],
      craft: { perDescribedEdge: 1, maxDescribed: 25, cleanBonus: 3 },
      veryStrongTokens: 2,
    },
    {
      id: "r3", title: "Reading the spaghetti", minutes: 20, tabs: ["network", "metrics"],
      goal: "Predict the structure of your map, then see what the engine says.",
      steps: [
        "On the Network tab, try Arrange, Systems thinking: drivers move to the left, outcomes to the right.",
        "Open Influence Metrics. First enter your team's predictions; then the results appear.",
        "Discuss any surprise: which relationships explain it?",
      ],
      checks: ["predictionsDone"],
      predictions: [
        { id: "p-driver", kind: "pickConcept", gatesTab: "metrics", prompt: "Which concept is the strongest driver: it sends much more influence than it receives?", rule: "topNet", top: 2, points: 2 },
        { id: "p-receiver", kind: "pickConcept", gatesTab: "metrics", prompt: "Which concept is the strongest receiver: it receives much more influence than it sends?", rule: "bottomNet", top: 2, points: 2 },
        { id: "p-loop", kind: "pickLoop", gatesTab: "metrics", prompt: "Pick two to four concepts that together form a feedback loop (a chain of arrows that returns to where it started), or tick that there is none.", rule: "loopExists", points: 2 },
      ],
    },
    {
      id: "r4", title: "Let it simmer", minutes: 25, tabs: ["network", "editor", "equilibrium"],
      goal: "Run the map and learn what starting values do.",
      steps: [
        "Open Baseline Equilibrium and answer the first question before you run it.",
        "Run it once with every starting value at 0, and explain to each other what you see.",
        "Give the concepts that describe today's situation a starting value (Inspector or Model editor), for example Heavy rain, Dry summers and Building close to the stream at about 0.6.",
        "Predict where each goal settles, then run Baseline Equilibrium again.",
      ],
      checks: ["zeroAnswered", "startValuesSet", "goalsAnswered"],
      predictions: [
        { id: "p-zero", kind: "choice", gatesTab: "equilibrium", stage: "zero",
          prompt: "Every starting value is 0 and nothing is held fixed. What happens when you run Baseline Equilibrium?",
          options: ["Everything stays at 0", "The goals go up", "The goals go down", "It depends on the weights"], correct: 0, points: 3,
          explain: "With every activation at 0, every concept receives an input of 0, and tanh(0) = 0: nothing can start to move, whatever the weights. A map needs a starting state, as a pendulum at rest needs a push." },
        { id: "p-goals", kind: "goalDirections", gatesTab: "equilibrium", stage: "goals", compare: "start",
          prompt: "Where does each goal settle compared with its starting value?", points: 2 },
      ],
    },
    {
      id: "r5", title: "What if", minutes: 35, tabs: ["network", "editor", "equilibrium", "scenarios"],
      goal: "Find a set of measures that helps every stakeholder, even under a changing climate.",
      steps: [
        "On the Scenarios & Simulation tab, make two or three scenarios. Switch a measure on with its up arrow.",
        "Draw the event card below and add it to your scenarios.",
        "Stay within the budget: Room for the Geul costs 3, Water retention in the hills 2, Higher walls 2. The budget is 6.",
        "Choose your proposal and enter your predictions here; then Run simulation is unlocked.",
      ],
      checks: ["twoScenarios", "eventDrawn", "proposalDone"],
      predictions: [
        { id: "p-proposal", kind: "proposal", gatesTab: "scenarios", compare: "eventOnly",
          prompt: "Compared with the same event without any measures, where does each goal end up in your proposal?", points: 2 },
      ],
      shared: { perRole: 2, noTradeOffBonus: 3 },
    },
  ],
};
