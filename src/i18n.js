import { en } from './lang/en.js';
import { mn } from './lang/mn.js';
import { getStorage, isConfigured, STORAGE_KEYS } from './config.js';

/**
 * Translation, shared by both clients. One translation system, deliberately:
 * the portal wraps tr() in a React context rather than adding i18next, because
 * two systems is how the two clients' wording quietly drifts apart.
 *
 * Moved from uniqsport/app/classes/LanguageHelper.js. The only change is that
 * the stored locale goes through the injected storage instead of AsyncStorage.
 */

export const translations = Object.freeze({ en, mn });

/**
 * Locale the backend stores its content under. Entities carry `name` for this
 * locale and `name_<locale>` for every other one, e.g. `name_en`.
 */
export const CONTENT_LOCALE = 'mn';

/** Used when the active locale has no entry for a key. Every key exists here. */
export const FALLBACK_LOCALE = 'mn';

export const DEFAULT_LOCALE = 'mn';

let currentLocale = DEFAULT_LOCALE;

const listeners = new Set();

export function getSupportedLocales() {
    return Object.keys(translations);
}

export function isSupported(locale) {
    return getSupportedLocales().includes(locale);
}

export function getLocale() {
    return currentLocale;
}

/**
 * Restores the stored locale into memory. Call once before the first render
 * so screens do not flash the default locale.
 */
export async function load() {
    if (!isConfigured()) return currentLocale;

    try {
        const stored = await getStorage().getItem(STORAGE_KEYS.language);

        if (stored && isSupported(stored)) {
            currentLocale = stored;
        }
    } catch (error) {
        // Unreadable storage: keep the default.
    }

    return currentLocale;
}

export async function setLanguage(locale) {
    if (!isSupported(locale) || locale === currentLocale) {
        return currentLocale;
    }

    currentLocale = locale;

    // Notify before persisting so the UI switches on the same frame.
    listeners.forEach((listener) => listener(currentLocale));

    if (isConfigured()) {
        try {
            await getStorage().setItem(STORAGE_KEYS.language, locale);
        } catch (error) {
            // Not persisted; the switch still applies to this session.
        }
    }

    return currentLocale;
}

/** Registers a locale change listener. Returns the unsubscribe function. */
export function subscribe(listener) {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
}

/**
 * Translates a key, falling back to the fallback locale and then to the key
 * itself so a missing entry is visible rather than blank.
 *
 * Placeholders are written as {name} and filled from params:
 *   tr('selectField', {field: tr('gender')})
 *
 * A param that is null or undefined fills in as an empty string. (The mobile
 * original passed it to Array.join, which treats undefined as "use the
 * default separator" — so a missing value rendered as a stray comma.)
 */
export function tr(key, params) {
    let translated = translations[currentLocale]?.[key];

    if (translated == null) {
        translated = translations[FALLBACK_LOCALE]?.[key];
    }

    if (translated == null) {
        translated = key;
    }

    if (params) {
        for (const name of Object.keys(params)) {
            const value = params[name];
            translated = translated.split('{' + name + '}').join(value == null ? '' : String(value));
        }
    }

    return translated;
}

/**
 * Reads a localized field off a backend entity, e.g. `name` / `name_en`,
 * falling back to the content locale when the translation is missing.
 */
export function getItemField(item, field = 'name') {
    if (!item) {
        return undefined;
    }

    if (currentLocale === CONTENT_LOCALE) {
        return item[field];
    }

    return item[field + '_' + currentLocale] || item[field];
}

export function getItemName(item) {
    return getItemField(item, 'name');
}

export async function checkLocale() {
    if (!isConfigured()) return null;
    return getStorage().getItem(STORAGE_KEYS.language);
}

/** Every {placeholder} name in a string, sorted — used by the parity tests. */
export function placeholdersOf(text) {
    const names = new Set();
    for (const match of String(text).matchAll(/\{([A-Za-z0-9_]+)\}/g)) names.add(match[1]);
    return [...names].sort();
}
