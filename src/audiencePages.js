// The pages behind the "Who it is for" cards on the About tab: for each
// group, why they would use the tool, a typical way of working (each step can
// open the tab it names), what they take away, and what to keep in mind.
// Text only, so it can be edited without touching the layout in AboutTab.jsx.
// A step's `tab` is a tab id; `action` names something else to open
// ("combine", "guide", "game").

export const AUDIENCE_PAGES = {
  researchers: {
    title: "Researchers",
    lead: "Build transparent, reproducible models of complex social-ecological systems and analyse them in depth, with every method documented and every number traceable to an equation in the Methodological Annex.",
    purpose: [
      "Turn qualitative knowledge from interviews, workshops or literature into a semi-quantitative causal model.",
      "Identify which concepts drive the system and which ones only respond to it, and along which routes influence travels.",
      "Test how robust conclusions are to uncertain weights, through sensitivity analysis and Monte Carlo simulation.",
      "Locate transition points and compare pathways towards a desired state of the system.",
    ],
    steps: [
      { title: "Build or import the map", text: "Draw the map on the Network tab, or import maps collected elsewhere as .json files.", tab: "network" },
      { title: "Combine stakeholder maps", text: "Aggregate individual maps into one group map, with credibility weights, and compare how alike the maps are.", action: "combine" },
      { title: "Analyse the structure", text: "Centrality, transmitters and receivers, feedback loops and influence routes.", tab: "metrics" },
      { title: "Simulate scenarios", text: "Compare interventions against the baseline equilibrium.", tab: "scenarios" },
      { title: "Test robustness", text: "Vary the weights one at a time or all together, and see which conclusions hold.", tab: "sensitivity" },
      { title: "Explore transitions", text: "Find transition points and rank pathways by total outcome gain.", tab: "transition" },
    ],
    outputs: [
      "An Analysis Workbook (.xlsx) with the model structure, metrics and every analysis that was run.",
      "Publication-ready figures with adjustable size, font and colour-blind safe palettes.",
      "A model file (.json) that others can open to reproduce the results.",
    ],
    caveats: [
      "Results are implications of the map as drawn, not forecasts. Report the settings used (transfer function, update rule, lambda).",
      "Weights elicited from people are judgements. Report how they were obtained, and how sensitive the conclusions are to them.",
    ],
    doc: "annex",
  },
  facilitators: {
    title: "Facilitators",
    lead: "Use the map as a shared object in workshops and interviews, so participants can make their view of the system explicit, discuss it, and see what it implies straight away.",
    purpose: [
      "Structure a discussion around concepts and causal relationships rather than positions.",
      "Build a map live with a group, on a large screen, in the presentation view.",
      "Collect individual maps and combine them into a group map, showing where people agree and disagree.",
      "Show participants immediately what their map implies, which keeps them engaged and invites revision.",
    ],
    steps: [
      { title: "Prepare a starting map", text: "Add the central question and a few concepts, or start from an empty map with the group.", tab: "editor" },
      { title: "Draw with the group", text: "Add concepts and relationships as they come up. Ask for the direction and strength of each one.", tab: "network" },
      { title: "Show what it implies", text: "Run the baseline and one or two what-if scenarios the group proposes.", tab: "equilibrium" },
      { title: "Combine maps", text: "When participants drew their own maps, aggregate them and discuss the relationships where signs disagree.", action: "combine" },
    ],
    outputs: [
      "A map that records the group's shared understanding, with descriptions of each relationship.",
      "A list of points of disagreement (opposite signs) to take into the next session.",
      "Figures for a workshop report.",
    ],
    caveats: [
      "Keep the basic view in sessions with newcomers; the Advanced tools switch shows more analyses but also more choices.",
      "Models are saved in the browser of the computer used. Use Export JSON after each session.",
    ],
    doc: "manual",
  },
  policy: {
    title: "Policy makers",
    lead: "Explore what-if questions before committing to an intervention: which levers matter, what side effects to expect, and whether an intervention is strong enough to move the system to a different state.",
    purpose: [
      "Compare interventions side by side against the current course of the system.",
      "See indirect and unintended effects that travel through the map, not only the direct ones.",
      "Find out how much change is needed before a desired shift in outcomes occurs.",
      "Use maps of different stakeholder groups to anticipate where support and resistance may arise.",
    ],
    steps: [
      { title: "Read the map", text: "Look at which concepts influence many others (the levers) and which ones mostly respond.", tab: "metrics" },
      { title: "Test interventions", text: "Define each intervention as a scenario and compare the outcomes with the baseline.", tab: "scenarios" },
      { title: "Check the tipping points", text: "See at what intensity an intervention starts to pay off.", tab: "transition" },
      { title: "Compare pathways", text: "Rank combinations and sequences of interventions by their total outcome gain.", tab: "pathways" },
    ],
    outputs: [
      "A comparison of interventions with their direct and indirect effects.",
      "Insight into trade-offs between outcomes, and into which interventions reinforce each other.",
    ],
    caveats: [
      "A map shows the direction and relative size of effects, not exact amounts or timing. Use it to structure a decision, not to replace one.",
      "Ask who drew the map. A map from one group reflects that group's view of the system.",
    ],
    doc: "manual",
  },
  stakeholders: {
    title: "Local stakeholders",
    lead: "Farmers, residents, water managers, nature organisations and businesses hold detailed knowledge of how their system works. The map makes that knowledge visible and puts it on an equal footing with other sources.",
    purpose: [
      "Show how you see the system: what matters, and what affects what.",
      "Compare your map with those of others and discover where views differ.",
      "Explore what proposed measures would mean for the things you care about.",
    ],
    steps: [
      { title: "Learn the basics", text: "Follow the Getting started guide while you draw your first map.", action: "guide" },
      { title: "Draw your map", text: "Add the concepts that matter to you and connect them.", tab: "network" },
      { title: "See what it implies", text: "Run the baseline and try a change, for example a measure that is being discussed.", tab: "scenarios" },
    ],
    outputs: [
      "Your own map, which you can keep, share or bring to a meeting as a file.",
    ],
    caveats: [
      "There is no wrong map: it records how you see the system. Descriptions of the relationships help others understand your reasoning.",
      "Everything stays in your own browser. Nothing is sent to a server.",
    ],
    doc: "manual",
  },
  education: {
    title: "Students and teachers",
    lead: "Learn systems thinking by doing: build a causal map, run it, and see how feedback loops, indirect effects and tipping points arise from the structure of a system.",
    purpose: [
      "Introduce fuzzy cognitive mapping and systems thinking in a course, without installing software.",
      "Let students build and compare their own models of a case.",
      "Practise the full cycle of modelling: structure, simulation, scenarios and robustness.",
    ],
    steps: [
      { title: "Play the Meinweg game", text: "A 30-minute tutorial in which students build a model of a national park and answer its questions.", action: "game" },
      { title: "Follow the guide", text: "Step-by-step help that follows students through the tabs.", action: "guide" },
      { title: "Build a model of a case", text: "Students draw their own map of a course case.", tab: "network" },
      { title: "Compare the class's maps", text: "Combine the students' maps and discuss where they differ.", action: "combine" },
    ],
    outputs: [
      "Student models as .json files that can be handed in and opened by the teacher.",
      "Figures and an Analysis Workbook for assignments.",
    ],
    caveats: [
      "The User Manual includes a primer on fuzzy cognitive maps and a glossary, suitable as course reading.",
    ],
    doc: "manual",
  },
};
