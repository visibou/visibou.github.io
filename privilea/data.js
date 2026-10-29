/* =====================================================================
   PRIVILEA — CIVIC WEIGHTING TERMINAL
   Everything the team needs to edit lives in this file.

   HOW THE WEIGHT IS CALCULATED
   - Every citizen has a `score` from 0 to 1 for each factor below
     (0 = least privileged, 1 = most privileged).
   - Each factor has an `importance`. The PRIVILEGE INDEX (0–100) is the
     importance-weighted average of the scores.
   - The VOTE WEIGHT is derived from the index using CONFIG.weight.
     In Privilea, LESS privilege = MORE powerful vote: a citizen at
     index 0 gets `max`, a citizen at index 100 gets `min`.
     To force an exact number for a citizen, set `voteWeight` on them.
   ===================================================================== */

window.PRIVILEA = {
  CONFIG: {
    beingName: "OMNI",                       // the all-knowing being
    beingLongName: "Omniscient Municipal Neural Intelligence",
    terminalName: "CIVIC WEIGHTING TERMINAL",
    terminalUnit: "UNIT 07",
    electionName: "ELECTION CYCLE 2026",

    idLength: 8,                // digits in a Citizen ID
    idGroupSize: 4,             // shown as 0000-0000
    operatorId: "20260067",     // typing this ID opens the operator panel

    weight: {
      favour: "less",           // "less" = less privilege, heavier vote · "more" = the opposite
      min: 0.1,                 // weight of the most privileged possible citizen
      max: 5.0,                 // weight of the least privileged possible citizen
      curve: 2.2,               // >1 exaggerates the gap between top and bottom
      decimals: 2,
    },

    // Labels shown on the alarm screen. First match (highest `min`) wins.
    tiers: [
      { min: 2.5, label: "AMPLIFIED VOICE", note: "Your voice is highly valued.", tone: "blue" },
      { min: 1.0, label: "STANDARD VOICE", note: "Your voice is acceptable.", tone: "ink" },
      { min: 0.4, label: "REDUCED VOICE", note: "Your voice has been adjusted.", tone: "red" },
      { min: 0, label: "NEGLIGIBLE VOICE", note: "Your voice has been noted.", tone: "red" },
    ],

    timing: {                   // milliseconds
      scanIntro: 1800,          // biometric lock before factors start
      perFactor: 1150,          // time spent on each factor
      scanOutro: 2200,          // "consulting OMNI" before the alarm
      alarmAutoAdvance: 20000,  // 0 = wait for the button
      voteConfirm: 1500,        // stamp shown after picking an option
      thankYou: 12000,          // then back to the start
      inactivityReset: 90000,   // abandon a session nobody is touching
    },

    sound: true,                // press M on the kiosk to toggle

    ticker: [
      "DON'T FORGET TO VOTE!",
      "YOUR VOTE IS VERY IMPORTANT",
      "AIR AND SOIL POLLUTION AT 0,21PPM — A 2,5% DECREASE",
      "VOTING GIVES US THE DATA WE NEED",
      "YOUR DATA IS SAFE WITH US",
      "WANT CHANGE? VOTE!",
      "EVERY VOICE IS HEARD. SOME ARE HEARD MORE CLEARLY.",
      "PRIVILEA — LOOKING OUT FOR YOU!",
    ],
  },

  /* ------------------------------------------------------------------
     FACTORS — the order here is the order they are calculated on screen.
     `source` and `log` are flavour text for the console.
     ------------------------------------------------------------------ */
  FACTORS: [
    { key: "tax",        label: "TAX BRACKET",          importance: 1.4, source: "MUNICIPAL TAX LEDGER",
      log: ["DECLARED INCOME RETRIEVED", "UNDECLARED ASSETS ESTIMATED", "DEBT EXPOSURE COMPUTED"] },
    { key: "skin",       label: "SKIN TONE",            importance: 1.2, source: "DERMAL SPECTROMETRY",
      log: ["REFLECTANCE SAMPLED AT 412 POINTS", "PIGMENT INDEX CALIBRATED", "HISTORICAL BIAS TABLE APPLIED"] },
    { key: "ethnicity",  label: "ETHNIC ORIGIN",        importance: 1.0, source: "GENEALOGICAL ARCHIVE",
      log: ["ANCESTRY TRACED 6 GENERATIONS", "MIGRATION RECORDS CROSS-REFERENCED", "LINEAGE CLASSIFIED"] },
    { key: "gender",     label: "GENDER",               importance: 1.0, source: "BIOMETRIC REGISTRY",
      log: ["REGISTRY ENTRY MATCHED", "PRESENTATION ANALYSED", "CLASSIFICATION LOCKED"] },
    { key: "education",  label: "EDUCATION",            importance: 1.1, source: "ACADEMIC CREDENTIAL VAULT",
      log: ["DIPLOMAS VERIFIED", "INSTITUTION PRESTIGE RANKED", "NETWORK VALUE ESTIMATED"] },
    { key: "sexuality",  label: "SEXUALITY",            importance: 0.9, source: "BEHAVIORAL PROFILE",
      log: ["BROWSING HISTORY PARSED", "SOCIAL GRAPH ANALYSED", "ORIENTATION INFERRED (98.1%)"] },
    { key: "occupation", label: "OCCUPATION / TITLE",   importance: 1.2, source: "LABOR REGISTRY",
      log: ["EMPLOYER CONFIRMED", "TITLE PRESTIGE SCORED", "REPLACEABILITY ASSESSED"] },
    { key: "hours",      label: "HOURS WORKED / WEEK",  importance: 0.8, source: "WORKPLACE TELEMETRY",
      log: ["BADGE SWIPES COUNTED", "LEISURE TIME DEDUCED", "FATIGUE IGNORED"] },
    { key: "district",   label: "RESIDENTIAL DISTRICT", importance: 0.9, source: "GEOLOCATION GRID",
      log: ["HOME COORDINATES FIXED", "PROPERTY VALUE INDEXED", "ZONE CLEARANCE CHECKED"] },
  ],

  /* ------------------------------------------------------------------
     CITIZENS — from the printed case files.
     Name, ID, age, gender, ethnicity, occupation and orientation come
     straight from the cards. Tax bracket, education, hours, district and
     skin tone are not on the cards and were invented to fit each profile.
     `id` must be exactly CONFIG.idLength digits (no dash).
     ------------------------------------------------------------------ */
  CITIZENS: [
    {
      id: "83517420", name: "LI WEI", age: 32, district: "DISTRICT 07 — DOCKLANDS",
      occupation: "WAREHOUSE WORKER", photo: "assets/citizens/li-wei.jpg",
      factors: {
        tax:        { value: "BRACKET 2 / 7",      score: 0.25 },
        skin:       { value: "FITZPATRICK III",    score: 0.65 },
        ethnicity:  { value: "CHINESE",            score: 0.45 },
        gender:     { value: "MALE",               score: 0.9 },
        education:  { value: "HIGH SCHOOL",        score: 0.35 },
        sexuality:  { value: "STRAIGHT",           score: 0.9 },
        occupation: { value: "WAREHOUSE WORKER",   score: 0.2 },
        hours:      { value: "58 H",               score: 0.15 },
        district:   { value: "DOCKLANDS",          score: 0.25 },
      },
    },
    {
      id: "92731584", name: "NAOMI PINAS", age: 24, district: "DISTRICT 09 — THE OUTSKIRTS",
      occupation: "HOME CARE ASSISTANT", photo: "assets/citizens/naomi-pinas.jpg",
      factors: {
        tax:        { value: "BRACKET 1 / 7",      score: 0.1 },
        skin:       { value: "FITZPATRICK V",      score: 0.25 },
        ethnicity:  { value: "SURINAMESE",         score: 0.25 },
        gender:     { value: "FEMALE",             score: 0.4 },
        education:  { value: "CARE CERTIFICATE",   score: 0.3 },
        sexuality:  { value: "GAY",                score: 0.3 },
        occupation: { value: "HOME CARE ASSISTANT", score: 0.15 },
        hours:      { value: "64 H",               score: 0.1 },
        district:   { value: "THE OUTSKIRTS",      score: 0.05 },
      },
    },
    {
      id: "46092831", name: "ROBERT JANSSEN", age: 51, district: "DISTRICT 01 — THE SPIRES",
      occupation: "PROPERTY INVESTOR", photo: "assets/citizens/robert-janssen.jpg",
      factors: {
        tax:        { value: "BRACKET 7 / 7",      score: 1.0 },
        skin:       { value: "FITZPATRICK II",     score: 0.9 },
        ethnicity:  { value: "DUTCH",              score: 0.95 },
        gender:     { value: "MALE",               score: 0.9 },
        education:  { value: "MBA",                score: 0.95 },
        sexuality:  { value: "STRAIGHT",           score: 0.9 },
        occupation: { value: "PROPERTY INVESTOR",  score: 1.0 },
        hours:      { value: "20 H",               score: 0.95 },
        district:   { value: "THE SPIRES",         score: 1.0 },
      },
    },
    {
      id: "58392017", name: "SARAH HASSAN", age: 26, district: "DISTRICT 08 — EASTGATE ESTATES",
      occupation: "CLEANER", photo: "assets/citizens/sarah-hassan.jpg",
      factors: {
        tax:        { value: "BRACKET 1 / 7",      score: 0.1 },
        skin:       { value: "FITZPATRICK III",    score: 0.6 },
        ethnicity:  { value: "MOROCCAN",           score: 0.25 },
        gender:     { value: "FEMALE",             score: 0.4 },
        education:  { value: "LOWER SECONDARY",    score: 0.2 },
        sexuality:  { value: "STRAIGHT",           score: 0.9 },
        occupation: { value: "CLEANER",            score: 0.1 },
        hours:      { value: "55 H",               score: 0.2 },
        district:   { value: "EASTGATE ESTATES",   score: 0.15 },
      },
    },
    {
      id: "19284756", name: "SOPHIA BEAUMONT", age: 22, district: "DISTRICT 05 — MIDTOWN",
      occupation: "STUDENT", photo: "assets/citizens/sophia-beaumont.jpg",
      factors: {
        tax:        { value: "BRACKET 3 / 7",      score: 0.45 },
        skin:       { value: "FITZPATRICK II",     score: 0.9 },
        ethnicity:  { value: "FRENCH",             score: 0.85 },
        gender:     { value: "FEMALE",             score: 0.4 },
        education:  { value: "UNDERGRADUATE",      score: 0.65 },
        sexuality:  { value: "GAY",                score: 0.3 },
        occupation: { value: "STUDENT",            score: 0.5 },
        hours:      { value: "18 H",               score: 0.6 },
        district:   { value: "MIDTOWN",            score: 0.55 },
      },
    },
    {
      id: "74628193", name: "THOMAS SMITH", age: 34, district: "DISTRICT 02 — CROWN HEIGHTS",
      occupation: "BUSINESS EXECUTIVE", photo: "assets/citizens/thomas-smith.jpg",
      factors: {
        tax:        { value: "BRACKET 6 / 7",      score: 0.85 },
        skin:       { value: "FITZPATRICK II",     score: 0.9 },
        ethnicity:  { value: "DUTCH",              score: 0.95 },
        gender:     { value: "MALE",               score: 0.9 },
        education:  { value: "MASTER'S DEGREE",    score: 0.85 },
        sexuality:  { value: "STRAIGHT",           score: 0.9 },
        occupation: { value: "BUSINESS EXECUTIVE", score: 0.9 },
        hours:      { value: "50 H",               score: 0.5 },
        district:   { value: "CROWN HEIGHTS",      score: 0.85 },
      },
    },
  ],

  /* ------------------------------------------------------------------
     QUESTIONS — exactly two options each.
     ------------------------------------------------------------------ */
  QUESTIONS: [
    { text: "Should every citizen’s vote count exactly the same?", a: "YES", b: "NO" },
    { text: "Do you still want OMNI to be in charge?", a: "YES", b: "NO" },
    { text: "Is a fair society worth giving up some personal privacy for?", a: "YES", b: "NO" },
  ],
};
