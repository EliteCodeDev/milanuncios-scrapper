// cookieHandler.js
const { sleep } = require('./utils');

async function handleCookiesConsent(page) {
    try {
        console.log('Buscando y manejando diálogos de cookies...');

        // Lista de posibles selectores para diferentes botones de cookies
        const cookieSelectors = [
            'button[id*="accept"]',
            'button[id*="cookie"]',
            'button[id*="consent"]',
            'button[class*="cookie"]',
            'button[class*="consent"]',
            'a[id*="accept"]',
            '.cookie-consent-accept',
            '.accept-cookies',
            '[data-testid="cookie-policy-dialog-accept-button"]'
        ];

        // Intentar cada selector
        for (const selector of cookieSelectors) {
            try {
                const cookieButton = await page.$(selector);
                if (cookieButton) {
                    console.log(`Encontrado botón de cookies: ${selector}`);

                    await cookieButton.click({ delay: 100 });
                    console.log('Cookies aceptadas.');

                    await sleep(1000);
                    return true;
                }
            } catch (e) {
                console.log(`Error al intentar con selector ${selector}: ${e.message}`);
            }
        }

        // Intento alternativo: buscar por texto
        try {
            const buttons = await page.$$('button');
            for (const button of buttons) {
                const text = await page.evaluate(el => el.innerText.toLowerCase(), button);
                if (text.includes('accept') || text.includes('acepto') || text.includes('aceptar')) {
                    console.log(`Encontrado botón por texto: "${text}"`);
                    await button.click({ delay: 100 });
                    console.log('Cookies aceptadas por texto.');
                    await sleep(1000);
                    return true;
                }
            }
        } catch (e) {
            console.log(`Error buscando por texto: ${e.message}`);
        }

        console.log('No se encontraron diálogos de cookies o ya estaban aceptadas.');
        return false;
    } catch (error) {
        console.log('Error al manejar cookies, continuando:', error.message);
        return false;
    }
}

module.exports = {
    handleCookiesConsent
};