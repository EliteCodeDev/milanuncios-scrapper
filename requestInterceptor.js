// requestInterceptor.js
async function setupRequestInterception(page) {
    await page.setRequestInterception(true);

    page.on('request', (request) => {
        const url = request.url();
        const resourceType = request.resourceType();

        // Bloquear recursos que no son necesarios para la extracción
        if (
            (resourceType === 'image' && !url.includes('milanuncios.com')) ||
            resourceType === 'media' ||
            url.includes('google-analytics') ||
            url.includes('facebook.net') ||
            url.includes('doubleclick.net') ||
            url.includes('amazon-adsystem') ||
            url.includes('/ads/') ||
            url.includes('analytics') ||
            url.includes('tracker')
        ) {
            request.abort();
        } else {
            request.continue();
        }
    });
}

module.exports = {
    setupRequestInterception
};