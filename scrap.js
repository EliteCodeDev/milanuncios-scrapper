// scrap.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');
const path = require('path');

// Importaciones de los módulos
const { sleep, getRandomUserAgent, initScreenshotDir } = require('./utils');
const { buildUrl } = require('./urlBuilder');
const { handleCookiesConsent } = require('./cookieHandler');
const { exhaustiveScroll, countVisibleElements } = require('./pageScroller');
const { extractData } = require('./dataExtractor');
const { solveCaptcha } = require('./captchaSolver');

// Inicializar directorio de capturas
const screenshotDir = initScreenshotDir();

// Función principal de scraping
async function scrapeMilanuncios(searchParams = {}) {
  const urlToScrape = buildUrl(searchParams);
  console.log(`Scraping URL: ${urlToScrape}`);
  
  let browser = null;
  let maxRetries = 2; // Número de reintentos en caso de fallo
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`\n=== Intento ${attempt} de ${maxRetries} ===\n`);
      }
      
      // Lanzar navegador con configuración mejorada
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
          '--window-size=1920,1080' // Pantalla más grande para ver más elementos
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: null // Usar el tamaño de la ventana
      };
      
      console.log('Lanzando navegador...');
      browser = await puppeteer.launch(launchOptions);
      
      // Crear página directamente
      const page = await browser.newPage();
      
      // Configurar tiempos de espera más altos
      page.setDefaultNavigationTimeout(60000);
      page.setDefaultTimeout(30000);
      
      // Configurar user agent aleatorio
      const userAgent = getRandomUserAgent();
      console.log(`Usando User-Agent: ${userAgent}`);
      await page.setUserAgent(userAgent);
      
      // Configurar cabeceras HTTP adicionales
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      });
      
      // Establecer cookies iniciales (ayuda a evitar algunas detecciones)
      await page.setCookie({
        name: 'visited_before',
        value: 'true',
        domain: '.milanuncios.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 86400
      });
      
      // Configurar interceptación de peticiones para bloquear recursos innecesarios
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
      
      // Navegar a la página con tiempos de carga extendidos
      console.log('Navegando a la URL...');
      
      await page.goto(urlToScrape, { 
        waitUntil: 'networkidle2',
        timeout: 60000 
      });
      
      console.log('Página cargada.');
      
      // Manejar cookies
      await handleCookiesConsent(page);
      
      // Esperar un tiempo antes de continuar
      await sleep(2000);
      
      // Verificar si hay captcha
      console.log('Comprobando si hay captcha...');
      
      // Intentar resolver captcha si existe
      const captchaResolved = await solveCaptcha(page);
      
      if (captchaResolved) {
        console.log('Captcha resuelto correctamente.');
      } else {
        console.log('No se encontró captcha o no se pudo resolver.');
      }
      
      // Esperar un poco más después del captcha
      await sleep(2000);
      
      // Contar elementos antes del scroll
      console.log('Contando elementos antes del scroll:');
      const initialCount = await countVisibleElements(page);
      
      // Realizar auto-scroll exhaustivo para cargar TODOS los elementos
      await exhaustiveScroll(page);
      
      // Contar elementos después del scroll
      console.log('Contando elementos después del scroll:');
      const finalCount = await countVisibleElements(page);
      
      console.log(`Incremento de elementos: ${finalCount - initialCount} (${initialCount} -> ${finalCount})`);
      
      // Esperar un poco después del auto-scroll
      await sleep(3000);
      
      // Extraer los datos de manera exhaustiva
      const scrapedData = await extractData(page, screenshotDir);
      
      // Verificar si hubo error en la extracción
      if (scrapedData && scrapedData.error) {
        console.log(`Error en la extracción: ${scrapedData.error}`);
        
        // Si estamos en el último intento, devolver lo que tengamos
        if (attempt === maxRetries) {
          console.log('Se alcanzó el número máximo de intentos.');
          await browser.close();
          browser = null;
          return { 
            error: scrapedData.error, 
            message: 'No se pudieron extraer datos después de múltiples intentos',
            partial: true
          };
        }
        
        // Si no es el último intento, cerrar y reintentar
        console.log('Preparando para reintentar...');
        await browser.close();
        browser = null;
        continue;
      }
      
      // Si llegamos aquí, la extracción fue exitosa
      console.log(`Extracción completada. Se extrajeron ${Array.isArray(scrapedData) ? scrapedData.length : 0} artículos.`);
      
      // Cerrar navegador y devolver datos
      await browser.close();
      browser = null;
      return Array.isArray(scrapedData) ? scrapedData : [];
      
    } catch (error) {
      console.error(`Error en scraping (intento ${attempt + 1}/${maxRetries + 1}):`, error.message);
      
      // Cerrar el navegador si sigue abierto
      if (browser) {
        await browser.close();
        browser = null;
      }
      
      // Si es el último intento, lanzar el error
      if (attempt === maxRetries) {
        throw new Error(`Error después de ${maxRetries + 1} intentos: ${error.message}`);
      }
      
      // Esperar antes de reintentar
      const retryDelay = (attempt + 1) * 5000; // Incrementar tiempo entre reintentos
      console.log(`Esperando ${retryDelay/1000} segundos antes de reintentar...`);
      await sleep(retryDelay);
    }
  }
}

module.exports = scrapeMilanuncios;