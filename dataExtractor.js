// dataExtractor.js
const fs = require('fs');
const path = require('path');

async function extractData(page, screenshotDir) {
    try {
        console.log('Extrayendo información de los artículos...');

        // *** CORRECCIÓN 1: Priorizar el selector específico ***
        // Usaremos principalmente 'article.ma-AdCardV2' como en V3, pero mantenemos un fallback.
        const primaryArticleSelector = 'article.ma-AdCardV2';
        let articleSelector = primaryArticleSelector;

        let articlesFound = await page.evaluate((sel) => {
            return document.querySelectorAll(sel).length;
        }, articleSelector);

        console.log(`Selector primario "${articleSelector}": ${articlesFound} elementos`);

        // Fallback si el selector primario no funciona
        if (articlesFound < 5) { // Umbral bajo, si hay muy pocos, probar otro
            const fallbackSelectors = [
                'article[class*="AdCard"]', // Segundo más probable
                '[class*="AdCard"]:not(nav):not(header):not(footer)', // Intentar ser más específico
                '.list-item-card' // Otro posible contenedor
            ];
            for (const fbSelector of fallbackSelectors) {
                const fbCount = await page.evaluate((sel) => {
                    return document.querySelectorAll(sel).length;
                }, fbSelector);
                console.log(`Selector fallback "${fbSelector}": ${fbCount} elementos`);
                if (fbCount > articlesFound) {
                    articlesFound = fbCount;
                    articleSelector = fbSelector;
                    console.log(`Usando selector fallback "${articleSelector}" con ${articlesFound} elementos`);
                    break; // Usar el primer fallback que encuentre más elementos
                }
            }
        }

        if (articlesFound === 0) {
            console.log('No se encontraron artículos con selectores conocidos.');
            const html = await page.content();
            //fs.writeFileSync('page_no_articles.html', html);
            fs.writeFileSync(path.join(screenshotDir, 'page_no_articles.html'), html);
            await page.screenshot({ path: path.join(screenshotDir, 'no_articles_found.png') });
            return { error: 'No se encontraron artículos' };
        }

        console.log(`Usando selector "${articleSelector}" con ${articlesFound} elementos para la extracción final.`);

        // Extraer datos con el selector identificado y lógica corregida
        const scrapedData = await page.evaluate((selector) => {
            try {
                const data = [];
                const articles = document.querySelectorAll(selector);

                console.log(`Procesando ${articles.length} artículos con selector "${selector}"...`);

                articles.forEach((article, index) => {
                    try {
                        // *** CORRECCIÓN 2: Función getText modificada (usa querySelector) ***
                        const getText = (element, selectors, fieldName = '') => {
                            if (!element) return '';
                            for (const sel of selectors) {
                                try {
                                    const match = element.querySelector(sel);
                                    if (match && match.innerText) {
                                        let text = match.innerText.trim();

                                        // *** CORRECCIÓN 4: Limpieza de datos específica ***
                                        if (fieldName === 'price') {
                                            // Tomar solo la primera línea y asegurar símbolo € al final
                                            text = text.split('\n')[0].replace(/€/g, '').trim();
                                            if (text && !isNaN(text.replace(/\./g, ''))) { // Si es un número (aproximado)
                                                return text + ' €';
                                            } else if (match.innerText.includes('€')) {
                                                // Si no es número pero tenía euro, devolver el texto limpio
                                                return match.innerText.trim().split('\n')[0];
                                            }
                                            // Si no es un precio válido, seguir buscando
                                        } else if (fieldName === 'location') {
                                            // Si hay duplicados tipo "Ciudad (Provincia) Ciudad (Provincia)"
                                            const parts = text.split('\n');
                                            if (parts.length > 1 && parts[0].trim() === parts[1].trim()) {
                                                return parts[0].trim();
                                            }
                                            return text.split('\n')[0].trim(); // Tomar solo la primera línea
                                        } else {
                                            return text; // Devuelve el primer texto encontrado
                                        }
                                    }
                                } catch (e) { /* Ignorar error de selector individual */ }
                            }
                            return ''; // Devuelve vacío si ningún selector funcionó
                        };

                        // *** CORRECCIÓN 3: Listas de Selectores Refinadas ***
                        // Priorizar selectores exactos de V3 si aún son válidos
                        const titleSelectors = [
                            'h2.ma-AdCardV2-title',          // V3 exacto
                            'a[class*="AdCard-title-link"]', // Otra posibilidad común
                            'h2[class*="title"]',             // Más general pero útil
                            '[itemprop="name"]'              // Schema.org
                        ];

                        const priceSelectors = [
                            '.ma-AdPrice-value',             // V3 exacto
                            '[class*="Price-value"]',        // Variante común
                            '[itemprop="price"]',            // Schema.org
                            '[class*="price"] strong',       // Precio destacado
                            '[class*="AdPrice"]'             // Contenedor general precio
                        ];

                        const locationSelectors = [
                            '.ma-AdLocation-text',           // V3 exacto
                            '[class*="Location-text"]',      // Variante
                            '.ma-AdCard-location',           // Otra clase posible
                            '[itemprop="addressLocality"]',  // Schema.org
                            '[class*="location"] span'     // Último recurso
                        ];

                        const descriptionSelectors = [
                            '.ma-AdCardV2-description',     // V3 exacto
                            'p[class*="description"]',      // Párrafo de descripción
                            '[itemprop="description"]',     // Schema.org
                            '.ma-AdCard-description'        // Otra clase
                        ];

                        // *** CORRECCIÓN 5: Extracción de 'details' más específica ***
                        const details = [];
                        const detailSelectors = [
                            '.ma-AdTag-label',                 // V3 exacto (para Kms, Año, Combustible)
                            '[class*="pill"]',                 // A veces usan "pills"
                            '[class*="Attribute-label"]'       // Otra estructura común
                        ];
                        const detailElements = article.querySelectorAll(detailSelectors.join(', ')); // Combinar selectores

                        const title = getText(article, titleSelectors, 'title') || `Artículo ${index + 1}`; // Fallback title
                        const price = getText(article, priceSelectors, 'price') || 'Precio no disponible';
                        const location = getText(article, locationSelectors, 'location') || 'Ubicación no disponible';
                        const description = getText(article, descriptionSelectors, 'description') || 'Sin descripción';


                        // Procesar los detalles encontrados
                        const addedDetails = new Set(); // Para evitar duplicados en details
                        detailElements.forEach(el => {
                            try {
                                const text = el.innerText.trim();
                                // Filtro más estricto para detalles
                                if (text && text.length > 1 && text.length < 50 && // Longitud razonable
                                    text !== title &&                      // No es el título
                                    !price.includes(text.split(' ')[0]) && // No es parte del precio
                                    !location.includes(text) &&            // No es parte de la ubicación
                                    !description.startsWith(text.substring(0, 10)) && // No es el inicio de la descripción
                                    !/^\d+$/.test(text) &&                 // No es solo un número
                                    !addedDetails.has(text))               // No está ya añadido
                                {
                                    details.push(text);
                                    addedDetails.add(text);
                                }
                            } catch (e) {/*ignore*/ }
                        });


                        // *** CORRECCIÓN 6: Extracción URL / ImageUrl (Mantener lógica V5 pero asegurar contexto) ***
                        let url = '';
                        try {
                            // Buscar el enlace principal del artículo
                            const linkElement = article.querySelector('a[href][class*="Card-title-link"], a[href][class*="AdCard-link"], article > a[href]');
                            if (linkElement) {
                                url = linkElement.href;
                                if (url && !url.startsWith('http')) {
                                    url = new URL(url, window.location.origin).href;
                                }
                            } else {
                                // Fallback: buscar cualquier enlace dentro del artículo
                                const fallbackLink = article.querySelector('a[href]');
                                if (fallbackLink) {
                                    url = fallbackLink.href;
                                    if (url && !url.startsWith('http')) {
                                        url = new URL(url, window.location.origin).href;
                                    }
                                }
                            }
                        } catch (e) { /* Ignorar errores al obtener URL */ }

                        let imageUrl = '';
                        try {
                            const imgElement = article.querySelector('img[src]'); // Buscar cualquier imagen con src
                            if (imgElement && imgElement.src) {
                                imageUrl = imgElement.src;
                                if (imageUrl && imageUrl.startsWith('//')) {
                                    imageUrl = 'https:' + imageUrl; // Corregir URLs que empiezan con //
                                } else if (imageUrl && !imageUrl.startsWith('http')) {
                                    // A veces usan data-src o data-lazy-src para lazy loading
                                    const lazySrc = imgElement.getAttribute('data-src') || imgElement.getAttribute('data-lazy-src');
                                    if (lazySrc) {
                                        imageUrl = lazySrc;
                                    } else {
                                        imageUrl = new URL(imageUrl, window.location.origin).href; // Hacer absoluta si es relativa
                                    }
                                }
                                // Asegurar que sea https si es posible
                                if (imageUrl && imageUrl.startsWith('http://')) {
                                    imageUrl = imageUrl.replace('http://', 'https://');
                                }
                            }
                        } catch (e) { /* Ignorar errores al obtener imagen */ }

                        // Extracción ID (Mantener lógica V5, es más robusta)
                        let id = '';
                        try {
                            if (article.getAttribute('data-id')) {
                                id = article.getAttribute('data-id');
                            } else if (article.id) {
                                id = article.id;
                            } else if (url) {
                                const match = url.match(/\/(\d+)\.htm/) || url.match(/id=(\d+)/) || url.match(/\/(\d+)$/);
                                if (match && match[1]) {
                                    id = match[1];
                                }
                            }
                            // Si no se encontró un ID, usar una combinación simple como V3 pero con índice
                            if (!id) {
                                // Crear un hash simple o usar título+índice
                                id = title.substring(0, 10).replace(/\s/g, '') + '_' + index;
                            }
                        } catch (e) { /* Ignorar */ }


                        data.push({
                            id,
                            title,
                            price,
                            location,
                            description,
                            details, // Usar el array de detalles limpio
                            url,
                            imageUrl
                        });
                    } catch (itemError) {
                        console.error(`Error en ítem ${index}:`, itemError.message);
                        data.push({
                            id: `error_${index}`,
                            error: 'Error procesando artículo individual',
                            message: itemError.message,
                            partial: true // Indicar que es un resultado parcial/erróneo
                        });
                    }
                });

                return data;
            } catch (evalError) {
                console.error('Error dentro de page.evaluate:', evalError);
                return {
                    error: 'Error durante la extracción de datos en page.evaluate',
                    message: evalError.toString()
                };
            }
        }, articleSelector); // Pasar el selector final a page.evaluate

        return scrapedData;
    } catch (error) {
        console.error('Error general en extractData:', error.message);
        // Intentar tomar screenshot en error general también
        try {
            await page.screenshot({ path: path.join(screenshotDir, 'extract_data_error.png') });
        } catch (ssError) { console.error("Error al tomar screenshot en error:", ssError.message); }

        return { error: `Error general en extractData: ${error.message}` };
    }
}

module.exports = {
    extractData
};