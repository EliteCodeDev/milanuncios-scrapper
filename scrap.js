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
const { scrapWithPagination, getTotalListings, getMaxPages } = require('./pagination');
const { solveCaptcha } = require('./captchaSolver');

// Función principal de scraping
async function scrapeMilanuncios(searchParams = {}) {
  const urlToScrape = buildUrl(searchParams);
  console.log(`Scraping URL: ${urlToScrape}`);
  
  // Inicializar directorio de capturas
  const screenshotDir = initScreenshotDir();
  console.log('Directorio de capturas inicializado:', screenshotDir);
  
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
      
      // Crear página
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
      
      // Manejar diálogo de cookies si aparece
      await handleCookiesConsent(page);
      
      // Esperar un tiempo antes de continuar
      await sleep(2000);
      
      // Verificar si hay captcha inicial
      console.log('Comprobando si hay captcha inicial...');
      
      // Tomar captura para verificación visual
      await page.screenshot({ path: path.join(screenshotDir, 'initial_page.png') });
      
      // Intentar resolver captcha si existe
      const captchaResolved = await solveCaptcha(page);
      
      if (captchaResolved) {
        console.log('Captcha inicial resuelto correctamente.');
      } else {
        console.log('No se encontró captcha inicial o no se pudo resolver.');
      }
      
      // Esperar un poco más después del captcha
      await sleep(2000);
      
      // Obtener y mostrar información importante antes de comenzar el scraping
      const totalListings = await getTotalListings(page, screenshotDir);
      const maxPages = await getMaxPages(page);
      
      console.log('\n===== INFORMACIÓN DE LA CONSULTA =====');
      console.log(`- Total de anuncios: ${totalListings}`);
      console.log(`- Número total de páginas: ${maxPages > 0 ? maxPages : 'No determinado'}`);
      
      if (maxPages > 0) {
        console.log(`- Anuncios estimados por página: ~${Math.ceil(totalListings / maxPages)}`);
      }
      console.log('=====================================\n');
      
      // Realizar scraping con paginación completa
      console.log('Iniciando scraping con paginación...');
      const scrapedData = await scrapWithPagination(page, screenshotDir);
      
      // Verificar si hubo error o si no hay datos
      if (!scrapedData || scrapedData.length === 0) {
        console.log('No se obtuvieron datos en el scraping con paginación');
        
        // Si estamos en el último intento, devolver error
        if (attempt === maxRetries) {
          console.log('Se alcanzó el número máximo de intentos sin éxito.');
          await browser.close();
          browser = null;
          return { 
            error: 'No se pudieron extraer datos después de múltiples intentos',
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
      console.log(`\n===== RESUMEN FINAL DE SCRAPING =====`);
      console.log(`- Total de anuncios indicados en la página: ${totalListings}`);
      console.log(`- Total de anuncios extraídos: ${scrapedData.length}`);
      if (totalListings > 0) {
        const porcentaje = ((scrapedData.length / totalListings) * 100).toFixed(2);
        console.log(`- Porcentaje de cobertura: ${porcentaje}%`);
      }
      console.log(`- Número total de páginas: ${maxPages > 0 ? maxPages : 'No determinado'}`);
      console.log('=====================================\n');
      
      // Cerrar navegador y devolver datos
      await browser.close();
      browser = null;
      return scrapedData;
      
    } catch (error) {
      console.error(`Error en scraping (intento ${attempt + 1}/${maxRetries + 1}):`, error.message);
      
      // Tomar captura de error
      try {
        if (page) {
          await page.screenshot({ path: path.join(screenshotDir, `error_attempt_${attempt}.png`) });
        }
      } catch (ssError) {
        console.error('Error al tomar captura del error:', ssError.message);
      }
      
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