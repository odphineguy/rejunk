// Shared localStorage persistence for the /settings/* sub-pages.
// Each section gets its own `rejunk-settings-{section}` key. Writes dispatch a
// `settings-updated` window event (detail.section) so other components can react,
// matching the jobs-updated / employees-updated convention.

export const SETTINGS_EVENT = "settings-updated";

const keyFor = (section: string) => `rejunk-settings-${section}`;

const canUseLocalStorage = () =>
  typeof window !== "undefined" && Boolean(window.localStorage);

export function loadSettingsSection<T extends object>(
  section: string,
  defaults: T
): T {
  if (!canUseLocalStorage()) return defaults;
  try {
    const raw = window.localStorage.getItem(keyFor(section));
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return defaults;
  }
}

export function saveSettingsSection<T extends object>(
  section: string,
  value: T
): T {
  if (canUseLocalStorage()) {
    window.localStorage.setItem(keyFor(section), JSON.stringify(value));
    window.dispatchEvent(
      new CustomEvent(SETTINGS_EVENT, { detail: { section } })
    );
  }
  return value;
}
