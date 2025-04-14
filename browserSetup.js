// browserSetup.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

async function setupBrowser() {
    const launchOptions = {
        headless: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-features=IsolateOrigins,site-per-process,SitePerProcess',
            '--disable-site-isolation-trials',
            '--disable-web-security',
            '--disable-features=BlockInsecurePrivateNetworkRequests',
            '--window-size=1920,1080'
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: null
    };

    return await puppeteer.launch(launchOptions);
}

async function setupPage(browser, userAgent) {
    const page = await browser.newPage();

    // Configurar tiempos de espera
    page.setDefaultNavigationTimeout(60000);
    page.setDefaultTimeout(30000);

    // Configurar user agent
    await page.setUserAgent(userAgent);

    // Configurar cabeceras HTTP adicionales
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    });

    // Establecer cookies iniciales
    await page.setCookie({
        name: 'visited_before',
        value: 'true',
        domain: '.milanuncios.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 86400
    });

    return page;
}

module.exports = {
    setupBrowser,
    setupPage
};