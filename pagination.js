// pagination.js
const { sleep } = require('./utils');
const { solveCaptcha } = require('./captchaSolver');
const { extractData } = require('./dataExtractor');
const { exhaustiveScroll } = require('./pageScroller');
const path = require('path');
const fs = require('fs');

/**
 * Extrae el número total de anuncios de la consulta
 * @param {Object} page - Instancia de página de Puppeteer
 * @returns {Number} - Número total de anuncios o -1 si no se encuentra
 */
async function getTotalListings(page, screenshotDir) {
    try {
        // Selector para el elemento que muestra el número total de anuncios
        const selectors = [
            '[data-botify-total-hits]',
            '.ma-ContentListingSummary-label',
            '.ma-ContentListingSummary span',
            '[class*="Summary"] span:contains("anuncios")'
        ];

        let totalText = '';
        let totalNumber = -1;

        // Probar cada selector hasta encontrar el que funciona
        for (const selector of selectors) {
            totalText = await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                return element ? element.textContent : '';
            }, selector);

            if (totalText) {
                // Extraer el número de anuncios del texto
                const match = totalText.match(/(\d+(?:\.\d+)?)\s*anuncios?/i);
                if (match && match[1]) {
                    totalNumber = parseInt(match[1].replace(/\./g, ''), 10);
                    break;
                }
            }
        }

        // Si no encontramos con los selectores específicos, buscar más ampliamente
        if (totalNumber <= 0) {
            totalText = await page.evaluate(() => {
                // Buscar cualquier texto que contenga "anuncios"
                const elements = Array.from(document.querySelectorAll('*'));
                for (const el of elements) {
                    if (el.textContent && el.textContent.match(/\d+\s*anuncios/i)) {
                        return el.textContent;
                    }
                }
                return '';
            });

            if (totalText) {
                const match = totalText.match(/(\d+(?:\.\d+)?)\s*anuncios?/i);
                if (match && match[1]) {
                    totalNumber = parseInt(match[1].replace(/\./g, ''), 10);
                }
            }
        }

        if (totalNumber > 0) {
            console.log(`Total de anuncios en la consulta: ${totalNumber}`);
            return totalNumber;
        } else {
            console.log('No se pudo determinar el número total de anuncios');
            await page.screenshot({ path: path.join(screenshotDir, 'total_listings_not_found.png') });
            return -1;
        }
    } catch (error) {
        console.error('Error al obtener el total de anuncios:', error.message);
        return -1;
    }
}

/**
 * Determina el número máximo de páginas por el índice de paginación
 * @param {Object} page - Instancia de página de Puppeteer
 * @returns {Number} - Número máximo de páginas o -1 si no se encuentra
 */
async function getMaxPages(page) {
    try {
        // Capturar la estructura HTML completa del paginador
        const paginationHTML = await page.evaluate(() => {
            const paginationElement = document.querySelector('.ma-ContentListing-pagination, nav[aria-label="Navegación de paginación"]');
            return paginationElement ? paginationElement.outerHTML : null;
        });
        
        // Si encontramos el paginador, guardarlo para depuración
        if (paginationHTML) {
            console.log('✅ Estructura de paginación encontrada');
            // console.log(paginationHTML); // Descomentar para ver el HTML completo
        } else {
            console.log('❌ No se encontró la estructura de paginación en la página');
        }
        
        // MÉTODO DIRECTO: Este es el método más específico y debería funcionar para el ejemplo dado
        // Buscar directamente el último número visible después del divisor "..."
        const lastNumberAfterDivider = await page.evaluate(() => {
            // Primero buscar el divisor "..."
            const divider = document.querySelector('.sui-MoleculePagination-divider');
            if (divider) {
                // Buscar el siguiente elemento después del divisor
                let nextElement = divider.nextElementSibling;
                if (nextElement) {
                    // Buscar el botón dentro de ese elemento
                    const button = nextElement.querySelector('button');
                    if (button) {
                        const text = button.textContent.trim();
                        const pageNum = parseInt(text, 10);
                        if (!isNaN(pageNum)) {
                            return pageNum;
                        }
                    }
                }
            }
            return null;
        });
        
        if (lastNumberAfterDivider) {
            console.log(`✅ Método directo: Último número después del divisor "...": ${lastNumberAfterDivider}`);
            return lastNumberAfterDivider;
        }
        
        // MÉTODO DE EXTRACCIÓN COMPLETA: Obtener todos los botones y encontrar el número más alto
        console.log('Intentando método de extracción completa...');
        
        // Extraer todos los números de página visibles
        const allPageNumbers = await page.evaluate(() => {
            // Seleccionar todos los botones dentro del paginador
            const buttons = document.querySelectorAll('button');
            const numbers = [];
            
            // Extraer el texto de cada botón y convertirlo a número si es posible
            for (const button of buttons) {
                const text = button.textContent.trim();
                const pageNum = parseInt(text, 10);
                if (!isNaN(pageNum)) {
                    numbers.push(pageNum);
                }
            }
            
            return numbers;
        });
        
        console.log('Todos los números de página encontrados:', allPageNumbers);
        
        if (allPageNumbers.length > 0) {
            // El número más alto será el máximo de páginas
            const maxPage = Math.max(...allPageNumbers);
            console.log(`✅ Método de extracción completa: Máximo número de página: ${maxPage}`);
            return maxPage;
        }
        
        // Si todo falla, asumimos 10 páginas basado en el ejemplo proporcionado
        console.log('⚠️ No se pudo determinar el número máximo de páginas por ningún método, asumiendo 10 páginas por defecto');
        return 10;
    } catch (error) {
        console.error('Error al obtener el máximo de páginas:', error.message);
        return 10; // Valor predeterminado en caso de error
    }
}

/**
 * Verifica si estamos en una página válida de resultados
 * @param {Object} page - Instancia de página de Puppeteer
 * @returns {Boolean} - true si estamos en una página de resultados
 */
async function isResultPage(page) {
    try {
        // Verificar la presencia de los indicadores clave
        return await page.evaluate(() => {
            // Verificar si hay artículos o anuncios
            const hasListings = document.querySelectorAll('article, [class*="AdCard"], .ma-AdList > *').length > 0;
            
            // Verificar si hay elementos de resumen o encabezado
            const hasSummary = !!document.querySelector('.ma-ContentListingSummary, [data-botify-total-hits]');
            
            // Verificar si hay paginación
            const hasPagination = !!document.querySelector('.ma-ContentListing-pagination, .sui-MoleculePagination');
            
            return hasListings || (hasSummary && hasPagination);
        });
    } catch (error) {
        console.error('Error al verificar si es página de resultados:', error.message);
        return false;
    }
}

/**
 * Verifica si un número de página está marcado como activo en la paginación
 * @param {Object} page - Instancia de página de Puppeteer
 * @param {Number} pageNumber - Número de página a verificar
 * @returns {Boolean} - true si la página está activa
 */
async function isPageNumberActive(page, pageNumber) {
    return await page.evaluate((num) => {
        // Buscar botones con el número de página
        const buttons = Array.from(document.querySelectorAll('button'));
        
        for (const button of buttons) {
            // Verificar si el botón tiene el número correcto y está marcado como activo
            if (button.textContent.trim() === num.toString()) {
                // Verificar si tiene la clase "solid" o "active" o estilos de activo
                const isActive = 
                    button.classList.contains('sui-AtomButton--solid') ||
                    button.classList.contains('active') ||
                    button.getAttribute('aria-current') === 'page';
                
                return isActive;
            }
        }
        return false;
    }, pageNumber);
}

/**
 * Navega a la siguiente página utilizando varios métodos
 * @param {Object} page - Instancia de página de Puppeteer
 * @param {Number} currentPage - Número de página actual
 * @returns {Object} - Objeto con éxito y número de página actual
 */
async function goToNextPage(page, currentPage, screenshotDir) {
    try {
        const nextPageNumber = currentPage + 1;
        console.log(`Intentando navegar a la página ${nextPageNumber}...`);
        
        // Tomar captura de la página actual antes de navegar
        await page.screenshot({ 
            path: path.join(screenshotDir, `before_navigation_page_${currentPage}.png`),
            fullPage: false
        });
        
        // MÉTODO 1: Clic en el botón numérico
        console.log('Método 1: Intentando clic en botón numérico...');
        
        const hasNumberButton = await page.evaluate((nextNum) => {
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const button of buttons) {
                if (button.textContent.trim() === nextNum.toString() && !button.disabled) {
                    return true;
                }
            }
            return false;
        }, nextPageNumber);
        
        if (hasNumberButton) {
            console.log(`Encontrado botón para página ${nextPageNumber}, haciendo clic...`);
            
            await page.evaluate((nextNum) => {
                const buttons = Array.from(document.querySelectorAll('button'));
                for (const button of buttons) {
                    if (button.textContent.trim() === nextNum.toString() && !button.disabled) {
                        console.log(`Haciendo clic en botón de página ${nextNum}`);
                        button.click();
                        return true;
                    }
                }
                return false;
            }, nextPageNumber);
            
            // Esperar a que se complete la navegación
            await page.waitForNavigation({ 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            }).catch(e => {
                console.log('Timeout en navegación, continuando:', e.message);
            });
            
            // Verificar si la navegación fue exitosa
            const currentUrl = await page.url();
            if (currentUrl.includes(`pagina=${nextPageNumber}`) || 
                await isPageNumberActive(page, nextPageNumber)) {
                console.log(`Navegación exitosa a página ${nextPageNumber} por clic en botón`);
                await checkForCaptcha(page, screenshotDir, nextPageNumber);
                return { success: true, currentPage: nextPageNumber };
            }
        }
        
        // MÉTODO 2: Clic en el botón ">"
        console.log('Método 2: Intentando clic en botón "siguiente"...');
        
        const hasNextButton = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            for (const button of buttons) {
                if (button.textContent.trim() === '>' && !button.disabled) {
                    return true;
                }
            }
            return false;
        });
        
        if (hasNextButton) {
            console.log('Encontrado botón "siguiente", haciendo clic...');
            
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                for (const button of buttons) {
                    if (button.textContent.trim() === '>' && !button.disabled) {
                        button.click();
                        return true;
                    }
                }
                return false;
            });
            
            // Esperar a que se complete la navegación
            await page.waitForNavigation({ 
                waitUntil: 'networkidle2', 
                timeout: 30000 
            }).catch(e => {
                console.log('Timeout en navegación, continuando:', e.message);
            });
            
            // Verificar si la navegación fue exitosa
            await sleep(2000); // Esperar un poco más
            
            // Verificar si llegamos a una nueva página
            const newUrl = await page.url();
            if (newUrl.includes(`pagina=${nextPageNumber}`) || 
                await isPageNumberActive(page, nextPageNumber)) {
                console.log(`Navegación exitosa a página ${nextPageNumber} por clic en "siguiente"`);
                await checkForCaptcha(page, screenshotDir, nextPageNumber);
                return { success: true, currentPage: nextPageNumber };
            }
        }
        
        // MÉTODO 3: Navegación directa por URL
        console.log('Método 3: Intentando navegación directa por URL...');
        
        // Obtener la URL actual
        const currentUrl = await page.url();
        console.log('URL actual:', currentUrl);
        
        // Construir la URL para la siguiente página
        let nextPageUrl;
        
        if (currentUrl.includes('pagina=')) {
            // Si ya hay un parámetro de página, reemplazarlo
            nextPageUrl = currentUrl.replace(/pagina=\d+/, `pagina=${nextPageNumber}`);
        } else {
            // Si no hay parámetro de página, añadirlo
            const separator = currentUrl.includes('?') ? '&' : '?';
            nextPageUrl = `${currentUrl}${separator}pagina=${nextPageNumber}`;
        }
        
        console.log(`Navegando a URL directa: ${nextPageUrl}`);
        
        // Navegar a la nueva URL
        await page.goto(nextPageUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000
        }).catch(e => {
            console.log('Timeout en navegación directa por URL:', e.message);
        });
        
        // Esperar un poco para que cargue
        await sleep(3000);
        
        // Verificar si tenemos resultados
        await page.screenshot({ 
            path: path.join(screenshotDir, `after_url_navigation_page_${nextPageNumber}.png`) 
        });
        
        // Verificar si estamos en una página de resultados
        const isResults = await isResultPage(page);
        
        if (isResults) {
            console.log(`Navegación exitosa a página ${nextPageNumber} mediante URL directa`);
            await checkForCaptcha(page, screenshotDir, nextPageNumber);
            return { success: true, currentPage: nextPageNumber };
        }
        
        // Si llegamos aquí, ninguno de los métodos funcionó
        console.log('❌ Todos los métodos de navegación fallaron');
        
        // Último intento: Forzar la URL con nextToken
        if (currentUrl.includes('nextToken=')) {
            console.log('Intentando navegación manual con nextToken...');
            // Extraer el nextToken actual y crear la nueva URL
            // Esta es una solución temporal que podría requerir ajustes según el formato real del token
            const manualUrl = currentUrl.replace(/nextToken=[^&]+/, 'nextToken=NEXT_TOKEN_PLACEHOLDER')
                                        .replace(/pagina=\d+/, `pagina=${nextPageNumber}`);
            console.log(`URL manual (requeriría token correcto): ${manualUrl}`);
            // Nota: Implementar lógica para generar/obtener el token correcto si fuera necesario
        }
        
        return { success: false, currentPage };
    } catch (error) {
        console.error(`Error al navegar a la siguiente página: ${error.message}`);
        await page.screenshot({ 
            path: path.join(screenshotDir, `navigation_error_page_${currentPage}.png`)
        });
        return { success: false, currentPage };
    }
}

/**
 * Verifica y resuelve captchas después de la navegación si es necesario
 * @param {Object} page - Instancia de página de Puppeteer
 * @param {String} screenshotDir - Directorio para capturas
 * @param {Number} pageNumber - Número de página actual
 */
async function checkForCaptcha(page, screenshotDir, pageNumber) {
    // Verificar si estamos en una página de resultados
    const isResults = await isResultPage(page);
    
    if (!isResults) {
        console.log('No estamos en una página de resultados después de la navegación, verificando captcha...');
        await page.screenshot({ 
            path: path.join(screenshotDir, `possible_captcha_page_${pageNumber}.png`) 
        });
        
        // Intentar resolver el captcha
        const captchaResolved = await solveCaptcha(page);
        
        if (captchaResolved) {
            console.log('Captcha resuelto, esperando a que se cargue la página...');
            await sleep(3000);
            
            // Verificar si ahora estamos en una página de resultados
            const isResultsAfterCaptcha = await isResultPage(page);
            
            if (isResultsAfterCaptcha) {
                console.log('✅ Página de resultados cargada después de resolver captcha');
            } else {
                console.log('❌ Seguimos sin estar en una página de resultados después de resolver captcha');
            }
        } else {
            console.log('No se pudo resolver el captcha o no se detectó ninguno');
        }
    }
}

/**
 * Scraping con paginación completa
 * @param {Object} page - Instancia de página de Puppeteer
 * @param {String} screenshotDir - Directorio para guardar capturas
 * @returns {Array} - Datos extraídos de todas las páginas
 */
async function scrapWithPagination(page, screenshotDir) {
    try {
        let allData = [];
        let currentPage = 1;
        let isLastPage = false;
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 2;
        
        // Obtener el total de anuncios (para comparar al final)
        const totalListings = await getTotalListings(page, screenshotDir);
        
        // Obtener el número máximo de páginas
        const maxPages = await getMaxPages(page);
        
        console.log(`Iniciando scraping paginado (Total anuncios: ${totalListings}, Páginas estimadas: ${maxPages})`);
        
        while (!isLastPage) {
            console.log(`\n=== Procesando página ${currentPage} de ${maxPages} ===`);
            
            // Realizar scroll en la página actual
            await exhaustiveScroll(page);
            
            // Esperar a que se carguen todos los elementos
            await sleep(2000);
            
            // Extraer datos de la página actual
            const pageData = await extractData(page, screenshotDir);
            
            if (Array.isArray(pageData) && pageData.length > 0) {
                console.log(`Extraídos ${pageData.length} anuncios de la página ${currentPage}`);
                allData = allData.concat(pageData);
                consecutiveFailures = 0; // Resetear contador de fallos
                
                // Mostrar progreso
                if (totalListings > 0) {
                    console.log(`Progreso: ${allData.length}/${totalListings} anuncios (${((allData.length/totalListings)*100).toFixed(1)}%)`);
                }
                
                // Verificar si estamos en la última página
                if (currentPage >= maxPages) {
                    console.log(`Hemos llegado a la última página (${currentPage} de ${maxPages})`);
                    isLastPage = true;
                    break;
                }
                
                // Verificar si tenemos todos los anuncios
                if (totalListings > 0 && allData.length >= totalListings) {
                    console.log(`Hemos recopilado todos los anuncios (${allData.length}/${totalListings})`);
                    isLastPage = true;
                    break;
                }
                
                // Ir a la siguiente página
                const nextPageResult = await goToNextPage(page, currentPage, screenshotDir);
                
                if (nextPageResult.success) {
                    currentPage = nextPageResult.currentPage;
                } else {
                    consecutiveFailures++;
                    console.log(`Fallo al navegar a la siguiente página (intento fallido #${consecutiveFailures})`);
                    
                    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                        console.log(`Se alcanzó el máximo de fallos consecutivos (${MAX_CONSECUTIVE_FAILURES}), finalizando paginación`);
                        isLastPage = true;
                    }
                }
            } else {
                consecutiveFailures++;
                console.log(`No se obtuvieron datos en la página ${currentPage} (fallo #${consecutiveFailures})`);
                
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    console.log('Demasiados fallos consecutivos, finalizando paginación');
                    isLastPage = true;
                } else {
                    // Intentar avanzar a pesar del error
                    const nextPageResult = await goToNextPage(page, currentPage, screenshotDir);
                    
                    if (nextPageResult.success) {
                        currentPage = nextPageResult.currentPage;
                    } else {
                        console.log('No se pudo avanzar a la siguiente página, finalizando');
                        isLastPage = true;
                    }
                }
            }
        }
        
        console.log(`\n=== Scraping paginado completado ===`);
        console.log(`Total de anuncios extraídos: ${allData.length}`);
        
        if (totalListings > 0) {
            const coveragePercentage = ((allData.length/totalListings)*100).toFixed(1);
            console.log(`Comparación con el total indicado: ${allData.length}/${totalListings} (${coveragePercentage}%)`);
        }
        
        return allData;
    } catch (error) {
        console.error('Error en scrapWithPagination:', error.message);
        await page.screenshot({ path: path.join(screenshotDir, 'pagination_error.png') });
        return [];
    }
}

module.exports = {
    getTotalListings,
    getMaxPages,
    isResultPage,
    isPageNumberActive,
    goToNextPage,
    scrapWithPagination
};