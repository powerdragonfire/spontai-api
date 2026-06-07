// Future-provider stubs. Interfaces live in ./types; these are no-op implementations
// so the engine can depend on them today and swap in real adapters later without
// changing call sites. Each returns "no data" → scoring falls back to heuristics +
// lower confidence rather than fabricating values.

import type {
  EventContextProvider,
  FootTrafficProvider,
  WeatherProvider,
} from "@/lib/hidden-gems/providers/types";

/** TODO(future): BestTime.app foot-traffic adapter. */
export class NullFootTrafficProvider implements FootTrafficProvider {
  getBusyness(): Promise<number | null> {
    return Promise.resolve(null);
  }
}

/** TODO(future): real weather adapter (caller may pass weather explicitly meanwhile). */
export class NullWeatherProvider implements WeatherProvider {
  getCurrent(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

/** TODO(future): PredictHQ event-context adapter. */
export class NullEventContextProvider implements EventContextProvider {
  getEvents(): Promise<unknown[]> {
    return Promise.resolve([]);
  }
}
