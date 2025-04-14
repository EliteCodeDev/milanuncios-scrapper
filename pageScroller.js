// pageScroller.js
const { sleep } = require('./utils');

async function exhaustiveScroll(page) {
    console.log('Iniciando scroll exhaustivo para cargar todos los elementos...');

    try {
        // Primer enfoque: scroll simple hasta el final
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 300;
                let iterations = 0;
                const maxIterations = 50; // Límite de seguridad

                const timer = setInterval(() => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    iterations++;

                    if (window.innerHeight + window.scrollY >= document.body.scrollHeight || iterations >= maxIterations) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 200);
            });
        });

        // Esperar a que se carguen elementos adicionales
        await sleep(2000);

        console.log('Realizando un segundo scroll para cargar elementos rezagados...');

        // Segundo enfoque: scroll más lento
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                // Primero, volver al principio
                window.scrollTo(0, 0);

                setTimeout(async () => {
                    const height = document.body.scrollHeight;
                    const scrollStep = Math.floor(height / 20); // Dividir la altura en 20 pasos

                    // Scroll paso a paso con pausa entre cada paso
                    for (let i = 0; i < 20; i++) {
                        window.scrollBy(0, scrollStep);
                        await new Promise(r => setTimeout(r, 400)); // Esperar 400ms entre scrolls
                    }

                    // Scroll final al fondo
                    window.scrollTo(0, height);
                    setTimeout(resolve, 1000);
                }, 500);
            });
        });

        // Esperar para asegurar que la carga de AJAX termine
        await sleep(2000);

        // Tercer enfoque: click en "mostrar más" o botones de paginación
        try {
            const loadMoreSelectors = [
                'button[class*="more"]',
                'a[class*="more"]',
                '[class*="load-more"]',
                '[class*="show-more"]',
                'button[class*="siguiente"]',
                'a[class*="siguiente"]',
                '.pagination a[class*="next"]',
                'button[class*="next"]'
            ];

            for (const selector of loadMoreSelectors) {
                const hasMoreButton = await page.evaluate((sel) => {
                    const elements = document.querySelectorAll(sel);
                    return elements.length > 0;
                }, selector);

                if (hasMoreButton) {
                    console.log(`Encontrado botón "mostrar más" o paginación: ${selector}`);

                    // Contar cuántos elementos tenemos antes de hacer clic
                    const countBefore = await page.evaluate((articleSelector) => {
                        return document.querySelectorAll(articleSelector).length;
                    }, 'article, [class*="AdCard"], [class*="result-item"]');

                    console.log(`Elementos antes de hacer clic: ${countBefore}`);

                    // Hacer clic en el botón
                    await page.click(selector);
                    await sleep(3000); // Esperar a que carguen más elementos

                    // Contar cuántos elementos tenemos después de hacer clic
                    const countAfter = await page.evaluate((articleSelector) => {
                        return document.querySelectorAll(articleSelector).length;
                    }, 'article, [class*="AdCard"], [class*="result-item"]');

                    console.log(`Elementos después de hacer clic: ${countAfter}`);

                    // Si cargaron más elementos, seguir haciendo clic hasta que no aumenten
                    if (countAfter > countBefore) {
                        let previousCount = countAfter;
                        let attempts = 0;

                        while (attempts < 5) { // Máximo 5 intentos
                            const stillHasButton = await page.evaluate((sel) => {
                                const btn = document.querySelector(sel);
                                return btn && (btn.offsetParent !== null); // Verificar que es visible
                            }, selector);

                            if (!stillHasButton) break;

                            console.log('Haciendo clic para cargar más elementos...');
                            await page.click(selector).catch(() => { }); // Ignorar errores de clic
                            await sleep(3000);

                            // Contar nuevamente
                            const newCount = await page.evaluate((articleSelector) => {
                                return document.querySelectorAll(articleSelector).length;
                            }, 'article, [class*="AdCard"], [class*="result-item"]');

                            console.log(`Elementos después del clic adicional: ${newCount}`);

                            // Si no aumentaron, salir del bucle
                            if (newCount <= previousCount) {
                                attempts++;
                            } else {
                                previousCount = newCount;
                                attempts = 0;
                            }
                        }
                    }

                    break; // Si encontramos un botón funcional, salir del bucle
                }
            }
        } catch (e) {
            console.log('Error al intentar cargar más elementos:', e.message);
        }

        console.log('Scroll exhaustivo completado.');
        return true;
    } catch (error) {
        console.error('Error en exhaustiveScroll:', error.message);
        return false;
    }
}

async function countVisibleElements(page) {
    try {
        const selectors = [
            'article.ma-AdCardV2',
            'article[class*="AdCard"]',
            'article',
            '.ma-AdCardV2',
            '[class*="AdCard"]',
            '[class*="listing-item"]',
            '[class*="result-item"]'
        ];

        let totalElements = 0;

        for (const selector of selectors) {
            const count = await page.evaluate((sel) => {
                return document.querySelectorAll(sel).length;
            }, selector);

            console.log(`Selector "${selector}": ${count} elementos`);
            totalElements = Math.max(totalElements, count);
        }

        console.log(`Total de elementos detectados: ${totalElements}`);
        return totalElements;
    } catch (error) {
        console.error('Error al contar elementos:', error.message);
        return 0;
    }
}

module.exports = {
    exhaustiveScroll,
    countVisibleElements
};