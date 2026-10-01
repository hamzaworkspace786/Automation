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
}

export function getProxyConfigForAccount(
    accountEmail: string,
    index: number
): AccountProxyConfig {
    const country = PROXY_COUNTRIES[index % PROXY_COUNTRIES.length];

    const host = process.env.PROXY_HOST || 'gw.dataimpulse.com';
    const port = process.env.PROXY_PORT || '823';
    const baseUser = process.env.PROXY_USER || process.env.PROXY_USERNAME;
    const password = process.env.PROXY_PASS || process.env.PROXY_PASSWORD;

    // If credentials are not set, return matching timezone/locale without proxy settings
    if (!baseUser || baseUser === 'dummy_user') {
        return {
            timezoneId: country.tz,
            locale: country.locale,
            countryCode: country.code,
        };
    }

    // Generate a clean sticky session ID per account
    const cleanEmail = accountEmail.replace(/[^a-zA-Z0-9]/g, '');
    const sessionId = `${cleanEmail}_${Date.now()}`;

    // DataImpulse targeting syntax: USERNAME__cr.COUNTRY;sid.SESSION_ID
    const formattedUsername = `${baseUser}__cr.${country.code};sid.${sessionId}`;

    // Ensure server protocol and port are included
    const hostWithPort = host.includes(':') ? host : `${host}:${port}`;
    const server = hostWithPort.startsWith('http') ? hostWithPort : `http://${hostWithPort}`;

    return {
        proxy: {
            server,
            username: formattedUsername,
            password,
        },
        timezoneId: country.tz,
        locale: country.locale,
        countryCode: country.code,
    };
}