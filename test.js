// test.js

// Si usas Node 18 o superior, ya viene incluido fetch.
// En versiones anteriores, puedes instalar node-fetch: npm install node-fetch
// y descomentar la siguiente línea:
// const fetch = require('node-fetch');

(async () => {
  try {
    // Define los parámetros de búsqueda
    const params = new URLSearchParams({
      s: 'hyundai negro',
      desde: '1010',
      hasta: '20200',
      //demanda: 'n', //COMENTADO PARA OBTENER MÁS RESULTADOS
      //vendedor: 'part', //COMENTADO PARA OBTENER MÁS RESULTADOS 
      orden: 'relevance',
      fromSearch: '1',
      fromSuggester: '1',
      suggestionUsed: '0',
      hitOrigin: 'listing',
      recentSearchShowed: '0',
      recentSearchUsed: '0'
    });

    // Construye la URL del endpoint del servidor
    const url = `http://localhost:3000/scrape?${params.toString()}`;
    console.log(`Probando endpoint: ${url}`);

    console.time('Tiempo total de scraping');
    
    // Realiza la petición GET
    const response = await fetch(url);
    const data = await response.json();

    console.timeEnd('Tiempo total de scraping');

    // Analizar la respuesta
    if (data.success) {
      console.log(`✅ Scraping exitoso: ${data.count} anuncios extraídos`);
      
      // Mostrar información resumida
      if (Array.isArray(data.data) && data.data.length > 0) {
        // Obtener las primeras 5 entradas para mostrar como ejemplo
        const examples = data.data.slice(0, 5);
        console.log('\nEjemplos de anuncios extraídos:');
        
        examples.forEach((item, index) => {
          console.log(`\n[${index + 1}] ${item.title}`);
          console.log(`    Precio: ${item.price}`);
          console.log(`    Ubicación: ${item.location}`);
          console.log(`    Detalles: ${item.details?.join(', ') || 'N/A'}`);
          console.log(`    URL: ${item.url || 'N/A'}`);
        });
        
        // Mostrar estadísticas generales
        const locations = {};
        const years = {};
        const kms = {};
        const prices = [];
        
        data.data.forEach(item => {
          // Contar localizaciones
          if (item.location && item.location !== 'Ubicación no disponible') {
            locations[item.location] = (locations[item.location] || 0) + 1;
          }
          
          // Extraer y contar años
          if (item.details && Array.isArray(item.details)) {
            const yearDetail = item.details.find(d => /^\d{4}$/.test(d));
            if (yearDetail) {
              years[yearDetail] = (years[yearDetail] || 0) + 1;
            }
            
            // Extraer y contar kilometrajes
            const kmDetail = item.details.find(d => /kms?/.test(d));
            if (kmDetail) {
              const category = kmDetail.replace(/\./g, '').match(/\d+/) ? 
                Math.floor(parseInt(kmDetail.replace(/\./g, '').match(/\d+/)[0]) / 25000) * 25000 + ' - ' + 
                (Math.floor(parseInt(kmDetail.replace(/\./g, '').match(/\d+/)[0]) / 25000) + 1) * 25000 : 
                'N/A';
              
              kms[category] = (kms[category] || 0) + 1;
            }
          }
          
          // Extraer precios para calcular estadísticas
          if (item.price && item.price !== 'Precio no disponible') {
            const priceNum = parseInt(item.price.replace(/[^\d]/g, ''));
            if (!isNaN(priceNum)) {
              prices.push(priceNum);
            }
          }
        });
        
        // Calcular estadísticas de precios
        const avgPrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
        const minPrice = prices.length ? Math.min(...prices) : 0;
        const maxPrice = prices.length ? Math.max(...prices) : 0;
        
        console.log('\n===== ESTADÍSTICAS =====');
        console.log(`Total anuncios: ${data.count}`);
        console.log(`Precio promedio: ${avgPrice.toLocaleString()} €`);
        console.log(`Rango de precios: ${minPrice.toLocaleString()} € - ${maxPrice.toLocaleString()} €`);
        
        // Top 3 localizaciones
        const topLocations = Object.entries(locations)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        
        console.log('\nTop 3 Localizaciones:');
        topLocations.forEach(([loc, count], i) => {
          console.log(`${i+1}. ${loc}: ${count} anuncios (${((count/data.count)*100).toFixed(1)}%)`);
        });
        
        // Top 3 años
        const topYears = Object.entries(years)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        
        if (topYears.length) {
          console.log('\nTop 3 Años:');
          topYears.forEach(([year, count], i) => {
            console.log(`${i+1}. ${year}: ${count} anuncios (${((count/data.count)*100).toFixed(1)}%)`);
          });
        }
        
        // Top 3 rangos de kilometraje
        const topKms = Object.entries(kms)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        
        if (topKms.length) {
          console.log('\nTop 3 Rangos de kilometraje:');
          topKms.forEach(([kmRange, count], i) => {
            console.log(`${i+1}. ${kmRange} km: ${count} anuncios (${((count/data.count)*100).toFixed(1)}%)`);
          });
        }
        
        // Calcular aproximadamente cuántas páginas se procesaron
        const itemsPerPage = 40; // Estimación de anuncios por página
        const approximatePages = Math.ceil(data.count / itemsPerPage);
        console.log(`\nNúmero aproximado de páginas procesadas: ${approximatePages}`);
      }
    } else {
      console.log(`❌ Error en scraping: ${data.error || 'Error desconocido'}`);
    }
  } catch (error) {
    console.error('Error durante la prueba:', error);
  }
})();