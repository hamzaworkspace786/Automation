import { normalizeEmail } from '@/lib/browser/session-state';
import {
    buildSessionId,
    readBinding,
    writeBinding,
} from './proxy-binding';

export interface CountryProfile {
    code: string;
    tz: string;
    locale: string;
}

export const PROXY_COUNTRIES: CountryProfile[] = [
    // North America
    { code: 'us', tz: 'America/New_York', locale: 'en-US' },
    { code: 'ca', tz: 'America/Toronto', locale: 'en-CA' },
    { code: 'mx', tz: 'America/Mexico_City', locale: 'es-MX' },

    // Europe
    { code: 'gb', tz: 'Europe/London', locale: 'en-GB' },
    { code: 'de', tz: 'Europe/Berlin', locale: 'de-DE' },
    { code: 'fr', tz: 'Europe/Paris', locale: 'fr-FR' },
    { code: 'it', tz: 'Europe/Rome', locale: 'it-IT' },
    { code: 'es', tz: 'Europe/Madrid', locale: 'es-ES' },
    { code: 'nl', tz: 'Europe/Amsterdam', locale: 'nl-NL' },
    { code: 'se', tz: 'Europe/Stockholm', locale: 'sv-SE' },
    { code: 'ch', tz: 'Europe/Zurich', locale: 'de-CH' },
    { code: 'ie', tz: 'Europe/Dublin', locale: 'en-IE' },
    { code: 'at', tz: 'Europe/Vienna', locale: 'de-AT' },

    // Oceania
    { code: 'au', tz: 'Australia/Sydney', locale: 'en-AU' },
    { code: 'nz', tz: 'Pacific/Auckland', locale: 'en-NZ' },

    // Asia & Others (Major Hubs)
    { code: 'jp', tz: 'Asia/Tokyo', locale: 'ja-JP' },
    { code: 'sg', tz: 'Asia/Singapore', locale: 'en-SG' },
    { code: 'in', tz: 'Asia/Kolkata', locale: 'en-IN' },
    { code: 'br', tz: 'America/Sao_Paulo', locale: 'pt-BR' },
    { code: 'za', tz: 'Africa/Johannesburg', locale: 'en-ZA' }
];

export interface AccountProxyConfig {
    proxy?: {
        server: string;
        username?: string;
        password?: string;
    };
    timezoneId: string;
    locale: string;
    countryCode: string;
    sessionId: string;
}

/**
 * Returns the proxy identity for an account.
 *
 * The first call for an email creates a binding (country, tz, locale, sessid)
 * and persists it. Every later call returns the SAME values, regardless of the
 * account's position in the submitted list, so the account keeps asking the
 * proxy for the same IP slot and presents the same geo fingerprint.
 *
 * `index` is only used to pick a country the first time an account is seen.
 */
export function getProxyConfigForAccount(
    accountEmail: string,
    index: number
): AccountProxyConfig {
    let binding = readBinding(accountEmail);

    if (!binding) {
        const country = PROXY_COUNTRIES[index % PROXY_COUNTRIES.length];
        binding = {
            email: normalizeEmail(accountEmail),
            countryCode: country.code,
            timezoneId: country.tz,
            locale: country.locale,
            generation: 0,
            sessionId: buildSessionId(accountEmail, 0),
            createdAt: new Date().toISOString(),
            ipChangeCount: 0,
        };
        writeBinding(binding);
    }

    const host = process.env.PROXY_HOST || 'gw.dataimpulse.com';
    const port = process.env.PROXY_PORT || '823';
    const baseUser = process.env.PROXY_USER || process.env.PROXY_USERNAME;
    const password = process.env.PROXY_PASS || process.env.PROXY_PASSWORD;

    const common = {
        timezoneId: binding.timezoneId,
        locale: binding.locale,
        countryCode: binding.countryCode,
        sessionId: binding.sessionId,
    };

    // If credentials are not set, return matching timezone/locale without proxy settings
    if (!baseUser || baseUser === 'dummy_user') {
        return common;
    }

    // DataImpulse syntax: LOGIN__cr.<country>;sessid.<id>[;sessttl.<minutes>]
    // (the parameter is `sessid`, not `sid`).
    let formattedUsername = `${baseUser}__cr.${binding.countryCode};sessid.${binding.sessionId}`;

    const ttl = Number.parseInt(process.env.PROXY_SESSION_TTL_MIN ?? '', 10);
    if (Number.isFinite(ttl) && ttl > 0) {
        formattedUsername += `;sessttl.${ttl}`;
    }

    // Ensure server protocol and port are included
    const hostWithPort = host.includes(':') ? host : `${host}:${port}`;
    const server = hostWithPort.startsWith('http') ? hostWithPort : `http://${hostWithPort}`;

    return {
        proxy: {
            server,
            username: formattedUsername,
            password,
        },
        ...common,
    };
}
