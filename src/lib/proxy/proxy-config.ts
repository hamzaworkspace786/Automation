export interface CountryProfile {
    code: string;
    tz: string;
    locale: string;
}

export const PROXY_COUNTRIES: CountryProfile[] = [
    { code: 'us', tz: 'America/New_York', locale: 'en-US' },
    { code: 'gb', tz: 'Europe/London', locale: 'en-GB' },
    { code: 'de', tz: 'Europe/Berlin', locale: 'de-DE' },
    { code: 'ca', tz: 'America/Toronto', locale: 'en-CA' },
    { code: 'fr', tz: 'Europe/Paris', locale: 'fr-FR' },
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

    const host = process.env.PROXY_HOST || 'gw.dataimpulse.com:823';
    const baseUser = process.env.PROXY_USERNAME;
    const password = process.env.PROXY_PASSWORD;

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

    // Ensure server protocol is included
    const server = host.startsWith('http') ? host : `http://${host}`;

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