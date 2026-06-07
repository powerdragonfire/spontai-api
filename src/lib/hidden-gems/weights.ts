// Tunable weights for the v1 explainable scoring model. Kept in one place so the
// model can be retuned without touching scoring logic. All "max" values are the
// most points a component can add (positive) or subtract (penalty) before clamping.

export const HIDDEN_GEM_WEIGHTS = {
  // Positive contributions
  socialVelocityMax: 40,
  localnessMax: 20,
  saveIntentMax: 15,
  commentIntentMax: 15,
  // Penalties (subtracted)
  saturationPenaltyMax: 30,
  touristTrapPenaltyMax: 15,
  mainstreamCoveragePenaltyMax: 15,
  mapsMaturityPenaltyMax: 20,
} as const;

export const VISIT_NOW_WEIGHTS = {
  openNowMax: 25,
  distanceMax: 20,
  weatherFitMax: 15,
  crowdMax: 20,
  timeOfDayFitMax: 10,
  userPreferenceFitMax: 10,
} as const;

// "Maps maturity" — a place is considered mainstream-discovered on Google once its
// review count crosses this. Penalty scales linearly up to this ceiling.
export const MAPS_MATURITY_REVIEW_CEILING = 1500;

// A normalised velocity at/above this (new mentions/day) is treated as "full" social heat.
export const VELOCITY_NORMALISER = 25;

// Distance falloff: full distance points within this many km, zero beyond DISTANCE_ZERO_KM.
export const DISTANCE_FULL_KM = 0.5;
export const DISTANCE_ZERO_KM = 5;

// Confidence: how many of the "rich" signals must be present for full confidence.
export const CONFIDENCE_REQUIRED_SIGNALS = 5;
