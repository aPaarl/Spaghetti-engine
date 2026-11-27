// ============================================================================
// Worked examples for backcasting and empirical data
// ============================================================================
// A small, illustrative peat meadow system in two versions (today and an
// envisioned future) and a matching table of yearly observations. They are
// loaded from the Backcasting tab and the Empirical data dialog, and the
// tests run them with the real engine (tests/test_worked_examples.cjs), so
// the numbers in the Methodological Annex can be reproduced exactly.
//
// Illustrative only: the structure follows the usual account of drained peat
// meadows (a lower water table oxidises peat, which causes subsidence and
// emissions; deeper drainage raises grass yield and lowers meadow bird
// numbers), but the weights and the data are invented for teaching and are
// not a calibrated model of any real area.

const C = (id, name, category, initialValue, description, x, y) => ({ id, name, category, description, initialValue, currentValue: initialValue, position: { x, y } });
const E = (source, target, weight, description = "", lag = 0) => ({ id: `e_${source}_${target}`, source, target, weight, description, ...(lag ? { lag } : {}) });

const WATER = "Water and soil", FARM = "Farming", NATURE = "Nature and climate", POLICY = "Policy";

/** Today's system: drainage is supported by a subsidy and follows the subsiding ground. */
export const PEAT_TODAY = {
  concepts: [
    C("wl", "Ditch water level", POLICY, 0.2, "The water level the water board sets in the ditches (0 = low, 1 = high). A driver: nothing in the map acts on it.", 0, 0),
    C("sub", "Drainage subsidy", POLICY, 0.6, "Support for pumping and deep drainage. A driver.", 0, 180),
    C("dd", "Drainage depth", WATER, 0, "Depth of the groundwater table below the surface.", 260, 90),
    C("po", "Peat oxidation", WATER, 0, "Decomposition of peat above the groundwater table.", 520, 0),
    C("ls", "Land subsidence", WATER, 0, "Lowering of the surface caused by oxidation.", 780, 0),
    C("gh", "Greenhouse gas emissions", NATURE, 0, "CO2 released from oxidising peat.", 780, 150),
    C("gy", "Grass yield", FARM, 0, "Grass production per hectare.", 520, 240),
    C("mb", "Meadow bird biodiversity", NATURE, 0, "Breeding meadow birds, which need wet grassland.", 520, 380),
    C("fi", "Farm income", FARM, 0, "Income of dairy farms in the area.", 780, 300),
  ],
  edges: [
    E("wl", "dd", -0.8, "A higher ditch level raises the groundwater table."),
    E("sub", "dd", 0.5, "The subsidy pays for deeper drainage."),
    E("ls", "dd", 0.3, "Drainage is deepened to follow the subsiding ground."),
    E("dd", "po", 0.8, "Peat above the water table oxidises."),
    E("po", "ls", 0.7, "Oxidised peat disappears, and the ground subsides.", 2),
    E("po", "gh", 0.8, "Oxidation releases CO2."),
    E("dd", "gy", 0.5, "Drier soil carries machines and grows more grass."),
    E("dd", "mb", -0.6, "Meadow birds need wet grassland."),
    E("gy", "fi", 0.7, "More grass, more milk."),
    E("ls", "fi", -0.3, "Subsidence brings damage and pumping costs."),
  ],
};

/** The envisioned system: a high water level, no drainage subsidy, wet crops and carbon payments. */
export const PEAT_VISION = {
  concepts: [
    ...PEAT_TODAY.concepts.filter((c) => c.id !== "sub").map((c) => (c.id === "wl" ? { ...c, initialValue: 0.8, currentValue: 0.8 } : { ...c })),
    C("pc", "Wet crops (paludiculture)", FARM, 0.6, "Crops grown on wet peat, such as cattail and sphagnum. A driver in the vision.", 260, 420),
    C("cp", "Carbon payments", POLICY, 0.5, "Payments for avoided emissions. A driver in the vision.", 0, 360),
  ],
  edges: [
    ...PEAT_TODAY.edges.filter((e) => e.source !== "sub" && !(e.source === "ls" && e.target === "dd")).map((e) => (e.source === "dd" && e.target === "mb" ? { ...e, weight: -0.8 } : { ...e })),
    E("pc", "fi", 0.5, "Wet crops are a second source of income."),
    E("pc", "gh", -0.3, "Wet crops store carbon."),
    E("cp", "fi", 0.4, "Farmers are paid for the emissions they avoid."),
  ],
};

// The units of the observations, and the range of each that stands for -1 and
// +1 on the map. The Empirical data dialog uses these as the fixed bounds
// ("Linear between two values", signed scale) when the example is loaded.
export const PEAT_UNITS = {
  wl: { unit: "cm above the reference level", range: [-80, 0] },
  sub: { unit: "euro per hectare per year", range: [0, 200] },
  dd: { unit: "cm below the surface", range: [20, 80] },
  po: { unit: "mm of peat per year", range: [0, 20] },
  ls: { unit: "mm per year", range: [0, 15] },
  gh: { unit: "t CO2-eq per hectare per year", range: [0, 40] },
  gy: { unit: "t dry matter per hectare", range: [6, 14] },
  mb: { unit: "breeding pairs per 100 hectares", range: [0, 60] },
  fi: { unit: "thousand euro per farm", range: [20, 100] },
};

/**
 * Yearly observations for the same area, 2010 to 2022, with the concept names
 * as column names (semicolons, decimal commas, as Excel writes them in Dutch).
 * Made from the map by tools/make_worked_example_data.mjs: today's settled
 * state in 2010, the ditch water level raised step by step from 2011 to 2016,
 * and the drainage subsidy halved in 2019, with a little observation noise.
 */
export const PEAT_DATA_CSV = `Year;Ditch water level;Drainage subsidy;Drainage depth;Peat oxidation;Land subsidence;Greenhouse gas emissions;Grass yield;Meadow bird biodiversity;Farm income
2010;-32,0;159,6;75,7;19,2;14,3;38,5;13,4;3,6;92,4
2011;-28,4;159,1;75,7;19,2;14,3;38,5;13,4;3,4;92,9
2012;-23,9;159,0;74,7;19,2;14,4;38,8;13,5;3,6;92,4
2013;-20,2;159,8;73,7;19,2;14,4;38,5;13,5;3,3;92,2
2014;-16,1;160,5;72,6;19,1;14,4;38,7;13,4;3,6;92,2
2015;-11,6;159,4;70,9;19,1;14,3;38,6;13,3;4,2;92,6
2016;-7,7;160,5;68,2;19,0;14,4;38,7;13,3;4,3;92,5
2017;-7,6;159,7;64,5;18,7;14,3;38,8;13,3;4,6;92,0
2018;-8,0;160,2;62,0;18,6;14,4;38,3;13,2;5,7;92,3
2019;-8,2;130,2;59,8;18,2;14,4;38,6;13,1;6,7;91,3
2020;-7,6;130,9;53,2;18,0;14,3;38,3;12,9;7,7;91,3
2021;-8,2;129,2;46,8;17,2;14,4;38,2;12,6;9,9;91,0
2022;-8,2;130,2;40,8;15,4;14,3;37,9;12,2;13,8;89,4
`;

export const PEAT_NAMES = { today: "Peat meadow today (worked example)", vision: "Peat meadow vision (worked example)" };
