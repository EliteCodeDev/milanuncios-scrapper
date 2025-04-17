// pageScroller.js
const { sleep } = require('./utils');

/**
 * Realiza un scroll exhaustivo y eficiente para cargar todos los elementos
 * sin repetir el recorrido
 * @param {Object} page - Instancia de página de Puppeteer
 * @returns {Boolean} - true si se completó correctamente
 */
async function exhaustiveScroll(page) {
    console.log('Iniciando scroll eficiente para cargar todos los elementos...');

    try {
        // Contar elementos antes del scroll
        const initialCount = await countVisibleElements(page);
        console.log(`Elementos iniciales antes del scroll: ${initialCount}`);

        // Realizar scroll progresivo y fluido
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                // Primero, asegurarse de estar al principio
                window.scrollTo(0, 0);
                
                let totalHeight = 0;
                const distance = 300; // Distancia para cada paso de scroll
                let timer = null;
                let lastScrollHeight = 0;
                let unchangedCount = 0;
                const maxUnchangedCount = 5; // Si la altura no cambia en 5 iteraciones, terminamos
                
                // Función para hacer scroll con pausas
                const scrollStep = () => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    
                    // Comprobar si hemos llegado al final o si la altura no cambia
                    if (document.body.scrollHeight <= window.innerHeight + window.scrollY) {
                        // Ya llegamos al final
                        clearInterval(timer);
                        resolve();
                        return;
                    }
                    
                    // Comprobar si la altura total no ha cambiado
                    if (document.body.scrollHeight === lastScrollHeight) {
                        unchangedCount++;
                        if (unchangedCount >= maxUnchangedCount) {
                            clearInterval(timer);
                            
                            // Hacer un último scroll al fondo para asegurar
                            window.scrollTo(0, document.body.scrollHeight);
                            
                            setTimeout(resolve, 500);
                            return;
                        }
                    } else {
                        // Resetear contador si la altura cambió
                        unchangedCount = 0;
                        lastScrollHeight = document.body.scrollHeight;
                    }
                };
                
                // Iniciar scroll con intervalo
                timer = setInterval(scrollStep, 200);
            });
        });

        // Esperar a que se carguen elementos adicionales
        await sleep(2000);
        
        // Contar elementos después del scroll
        const finalCount = await countVisibleElements(page);
        console.log(`Elementos cargados después del scroll: ${finalCount} (incremento: ${finalCount - initialCount})`);
        
        // Intentar hacer clic en "mostrar más" si existe
        await tryClickLoadMore(page);
        
        // Contar elementos finales
        const afterLoadMoreCount = await countVisibleElements(page);
        if (afterLoadMoreCount > finalCount) {
            console.log(`Elementos adicionales cargados tras "mostrar más": ${afterLoadMoreCount - finalCount}`);
        }
        
        console.log('Scroll exhaustivo completado.');
        return true;
    } catch (error) {
        console.error('Error en exhaustiveScroll:', error.message);
        return false;
    }
}

/**
 * Intenta hacer clic en botones "mostrar más" o de carga adicional
 * @param {Object} page - Instancia de página de Puppeteer
 * @returns {Boolean} - true si se encontró y clickeó algún botón
 */
async function tryClickLoadMore(page) {
    try {
        const loadMoreSelectors = [
            'button[class*="more"]',
            'a[class*="more"]',
            '[class*="load-more"]',
            '[class*="show-more"]',
            'button:not([disabled])[class*="siguiente"]',
            'a[class*="siguiente"]',
            'button:not([disabled])[class*="next"]'
        ];

        // Verificar si existe algún botón "mostrar más"
        const hasMoreButton = await page.evaluate((selectors) => {
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    // Verificar que el elemento es visible
                    if (el && el.offsetParent !== null && 
                        (el.tagName === 'BUTTON' || el.tagName === 'A') && 
                        !el.disabled) {
                        return { found: true, selector };
                    }
                }
            }
            return { found: false };
        }, loadMoreSelectors);

        if (hasMoreButton.found) {
            console.log(`Encontrado botón "mostrar más": ${hasMoreButton.selector}`);
            
            // Contar elementos antes de hacer clic
            const countBefore = await countVisibleElements(page);
            
            // Hacer clic en el botón (máximo 3 intentos)
            let clickSuccess = false;
            let attempts = 0;
            
            while (!clickSuccess && attempts < 3) {
                try {
                    await page.click(hasMoreButton.selector);
                    clickSuccess = true;
                    console.log('Clic exitoso en "mostrar más"');
                } catch (e) {
                    attempts++;
                    console.log(`Intento ${attempts} fallido: ${e.message}`);
                    await sleep(1000);
                }
            }
            
            if (clickSuccess) {
                // Esperar a que carguen más elementos
                await sleep(3000);
                
                // Realizar scroll adicional para asegurar que todo se cargue
                await page.evaluate(() => {
                    window.scrollTo(0, document.body.scrollHeight);
                });
                
                await sleep(1500);
                
                return true;
            }
        }
        
        return false;
    } catch (error) {
        console.error('Error en tryClickLoadMore:', error.message);
        return false;
    }
}

/**
 * Cuenta los elementos visibles utilizando varios selectores
 * @param {Object} page - Instancia de página de Puppeteer
 * @returns {Number} - Número total de elementos encontrados
 */
async function countVisibleElements(page) {
    try {
        const selectors = [
            'article.ma-AdCardV2',
            'article[class*="AdCard"]',
            'article',
            '.ma-AdCardV2',
            '[class*="AdCard"]',
            '[class*="listing-item"]',
            '[class*="result-item"]',
            '.ma-AdList > *'
        ];

        return await page.evaluate((selectors) => {
            let maxCount = 0;
            
            for (const selector of selectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    // Filtrar solo elementos visibles
                    const visibleElements = Array.from(elements).filter(el => {
                        return el && el.offsetParent !== null && 
                               (window.getComputedStyle(el).display !== 'none');
                    });
                    
                    if (visibleElements.length > maxCount) {
                        maxCount = visibleElements.length;
                    }
                } catch (e) {
                    console.error(`Error con selector ${selector}:`, e.message);
                }
            }
            
            return maxCount;
        }, selectors);
    } catch (error) {
        console.error('Error al contar elementos:', error.message);
        return 0;
    }
}

module.exports = {
    exhaustiveScroll,
    countVisibleElements,
    tryClickLoadMore
};