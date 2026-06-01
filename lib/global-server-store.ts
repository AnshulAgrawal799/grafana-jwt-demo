const globalStore = globalThis as typeof globalThis & {
  __grafanaJwtDemoBodyStore?: Map<string, unknown>;
};

export const db = globalStore.__grafanaJwtDemoBodyStore ?? new Map<string, unknown>();
globalStore.__grafanaJwtDemoBodyStore = db;