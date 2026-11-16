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
      { title: "Plan the workshop", text: "Build an agenda from ready-made steps, check that the model is ready, and print a script and a handout.", action: "workshop" },
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

// The same pages in Dutch (shown when the interface is set to NL).
export const AUDIENCE_PAGES_NL = {
  researchers: {
    title: "Onderzoekers",
    lead: "Bouw transparante, reproduceerbare modellen van complexe sociaal-ecologische systemen en analyseer ze grondig. Elke methode is gedocumenteerd en elk getal is te herleiden tot een formule in de Methodologische bijlage.",
    purpose: [
      "Kwalitatieve kennis uit interviews, workshops of literatuur omzetten in een semi-kwantitatief causaal model.",
      "Bepalen welke concepten het systeem sturen en welke er vooral op reageren, en langs welke routes invloed loopt.",
      "Toetsen hoe robuust conclusies zijn voor onzekere gewichten, met gevoeligheidsanalyse en Monte Carlo-simulatie.",
      "Kantelpunten vinden en routes naar een gewenste toestand van het systeem vergelijken.",
    ],
    steps: [
      { title: "Bouw of importeer de kaart", text: "Teken de kaart op het tabblad Netwerk, of importeer kaarten die elders zijn gemaakt als .json-bestand.", tab: "network" },
      { title: "Combineer kaarten van belanghebbenden", text: "Voeg individuele kaarten samen tot één groepskaart, met geloofwaardigheidsgewichten, en vergelijk hoe sterk de kaarten op elkaar lijken.", action: "combine" },
      { title: "Analyseer de structuur", text: "Centraliteit, zenders en ontvangers, terugkoppelingen en invloedsroutes.", tab: "metrics" },
      { title: "Simuleer scenario's", text: "Vergelijk interventies met het evenwicht van de basislijn.", tab: "scenarios" },
      { title: "Toets de robuustheid", text: "Varieer de gewichten één voor één of allemaal tegelijk, en zie welke conclusies blijven staan.", tab: "sensitivity" },
      { title: "Verken transities", text: "Zoek kantelpunten en rangschik routes naar hun totale opbrengst.", tab: "transition" },
    ],
    outputs: [
      "Een analysewerkboek (.xlsx) met de modelstructuur, de maten en elke uitgevoerde analyse.",
      "Figuren klaar voor publicatie, met instelbare grootte, lettertype en kleurenblind-veilige paletten.",
      "Een modelbestand (.json) waarmee anderen de resultaten kunnen herhalen.",
    ],
    caveats: [
      "Resultaten zijn gevolgen van de kaart zoals die getekend is, geen voorspellingen. Vermeld de gebruikte instellingen (overdrachtsfunctie, updateregel, lambda).",
      "Gewichten die mensen geven zijn oordelen. Vermeld hoe ze zijn verkregen en hoe gevoelig de conclusies ervoor zijn.",
    ],
    doc: "annex",
  },
  facilitators: {
    title: "Facilitatoren",
    lead: "Gebruik de kaart als gedeeld object in workshops en interviews, zodat deelnemers hun beeld van het systeem expliciet maken, erover praten en meteen zien wat het betekent.",
    purpose: [
      "Een gesprek structureren rond concepten en oorzaak-gevolgrelaties in plaats van rond standpunten.",
      "Samen met een groep live een kaart bouwen op een groot scherm, in de presentatieweergave.",
      "Individuele kaarten verzamelen en samenvoegen tot een groepskaart, zodat zichtbaar wordt waar mensen het eens en oneens zijn.",
      "Deelnemers direct laten zien wat hun kaart betekent; dat houdt ze betrokken en nodigt uit tot bijstellen.",
    ],
    steps: [
      { title: "Plan de workshop", text: "Stel een programma samen uit kant-en-klare stappen, controleer of het model klaar is en druk een draaiboek en een hand-out af.", action: "workshop" },
      { title: "Bereid een startkaart voor", text: "Zet de centrale vraag en een paar concepten klaar, of begin met de groep op een lege kaart.", tab: "editor" },
      { title: "Teken samen met de groep", text: "Voeg concepten en relaties toe zodra ze genoemd worden. Vraag bij elke relatie naar de richting en de sterkte.", tab: "network" },
      { title: "Laat zien wat het betekent", text: "Draai de basislijn en een of twee wat-als-scenario's die de groep voorstelt.", tab: "equilibrium" },
      { title: "Combineer kaarten", text: "Als deelnemers hun eigen kaart tekenden: voeg ze samen en bespreek de relaties waarover de tekens verschillen.", action: "combine" },
    ],
    outputs: [
      "Een kaart die het gedeelde beeld van de groep vastlegt, met een toelichting bij elke relatie.",
      "Een lijst met punten van onenigheid (tegengestelde tekens) voor een volgende sessie.",
      "Figuren voor een workshopverslag.",
    ],
    caveats: [
      "Gebruik de basisweergave in sessies met nieuwkomers; de schakelaar Geavanceerde functies toont meer analyses, maar ook meer keuzes.",
      "Modellen worden opgeslagen in de browser van de gebruikte computer. Gebruik na elke sessie Export JSON.",
    ],
    doc: "manual",
  },
  policy: {
    title: "Beleidsmakers",
    lead: "Verken wat-als-vragen voordat u zich vastlegt op een maatregel: welke knoppen ertoe doen, welke bijwerkingen te verwachten zijn en of een maatregel sterk genoeg is om het systeem in een andere toestand te brengen.",
    purpose: [
      "Maatregelen naast elkaar vergelijken met de huidige koers van het systeem.",
      "Indirecte en onbedoelde effecten zien die via de kaart doorwerken, niet alleen de directe.",
      "Nagaan hoeveel verandering nodig is voordat de gewenste verschuiving in uitkomsten optreedt.",
      "Kaarten van verschillende groepen gebruiken om te voorzien waar steun en weerstand kunnen ontstaan.",
    ],
    steps: [
      { title: "Lees de kaart", text: "Kijk welke concepten veel andere beïnvloeden (de knoppen) en welke vooral reageren.", tab: "metrics" },
      { title: "Test maatregelen", text: "Maak van elke maatregel een scenario en vergelijk de uitkomsten met de basislijn.", tab: "scenarios" },
      { title: "Bekijk de kantelpunten", text: "Zie vanaf welke intensiteit een maatregel gaat lonen.", tab: "transition" },
      { title: "Vergelijk routes", text: "Rangschik combinaties en volgordes van maatregelen naar hun totale opbrengst.", tab: "pathways" },
    ],
    outputs: [
      "Een vergelijking van maatregelen met hun directe en indirecte effecten.",
      "Inzicht in afwegingen tussen uitkomsten, en in maatregelen die elkaar versterken.",
    ],
    caveats: [
      "Een kaart toont de richting en de relatieve grootte van effecten, geen exacte hoeveelheden of tijdstippen. Gebruik haar om een besluit te structureren, niet om het te vervangen.",
      "Vraag wie de kaart heeft getekend. Een kaart van één groep weerspiegelt het beeld van die groep.",
    ],
    doc: "manual",
  },
  stakeholders: {
    title: "Lokale belanghebbenden",
    lead: "Boeren, bewoners, waterbeheerders, natuurorganisaties en bedrijven weten veel van hoe hun systeem werkt. De kaart maakt die kennis zichtbaar en zet haar op gelijke voet met andere bronnen.",
    purpose: [
      "Laten zien hoe u het systeem ziet: wat ertoe doet en wat wat beïnvloedt.",
      "Uw kaart vergelijken met die van anderen en ontdekken waar beelden verschillen.",
      "Verkennen wat voorgestelde maatregelen betekenen voor de dingen die u belangrijk vindt.",
    ],
    steps: [
      { title: "Leer de basis", text: "Volg de startgids terwijl u uw eerste kaart tekent.", action: "guide" },
      { title: "Teken uw kaart", text: "Voeg de concepten toe die voor u belangrijk zijn en verbind ze.", tab: "network" },
      { title: "Zie wat het betekent", text: "Draai de basislijn en probeer een verandering, bijvoorbeeld een maatregel die besproken wordt.", tab: "scenarios" },
    ],
    outputs: [
      "Uw eigen kaart, die u kunt bewaren, delen of als bestand meenemen naar een overleg.",
    ],
    caveats: [
      "Er bestaat geen foute kaart: zij legt vast hoe u het systeem ziet. Een toelichting bij de relaties helpt anderen uw redenering te begrijpen.",
      "Alles blijft in uw eigen browser. Er wordt niets naar een server gestuurd.",
    ],
    doc: "manual",
  },
  education: {
    title: "Studenten en docenten",
    lead: "Leer systeemdenken door te doen: bouw een causale kaart, laat haar draaien en zie hoe terugkoppelingen, indirecte effecten en kantelpunten voortkomen uit de structuur van een systeem.",
    purpose: [
      "Fuzzy cognitive mapping en systeemdenken in een vak introduceren, zonder software te installeren.",
      "Studenten hun eigen modellen van een casus laten bouwen en vergelijken.",
      "De volledige modelleercyclus oefenen: structuur, simulatie, scenario's en robuustheid.",
    ],
    steps: [
      { title: "Speel het Meinweg-spel", text: "Een les van 30 minuten waarin studenten een model van een nationaal park bouwen en de vragen ervan beantwoorden.", action: "game" },
      { title: "Volg de gids", text: "Stapsgewijze hulp die studenten door de tabbladen leidt.", action: "guide" },
      { title: "Bouw een model van een casus", text: "Studenten tekenen hun eigen kaart van een casus uit het vak.", tab: "network" },
      { title: "Vergelijk de kaarten van de groep", text: "Voeg de kaarten van de studenten samen en bespreek waar ze verschillen.", action: "combine" },
    ],
    outputs: [
      "Studentmodellen als .json-bestand, die kunnen worden ingeleverd en door de docent geopend.",
      "Figuren en een analysewerkboek voor opdrachten.",
    ],
    caveats: [
      "De handleiding bevat een inleiding op fuzzy cognitive maps en een woordenlijst, geschikt als leesstof bij een vak.",
    ],
    doc: "manual",
  },
};
