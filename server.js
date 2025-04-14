// server.js
const express = require('express');
const axios = require('axios');
const scrapeMilanuncios = require('./scrap');

const app = express();
const port = process.env.PORT || 3000;

// Middleware para permitir analizar JSON
app.use(express.json());

app.get('/scrape', async (req, res) => {
  try {
    // Extrae los parámetros de búsqueda desde la query string
    const searchParams = req.query;
    console.log('Parámetros recibidos:', searchParams);

    // Llama a la función de scraping con los parámetros recibidos
    const data = await scrapeMilanuncios(searchParams);
    console.log(`Se han obtenido ${Array.isArray(data) ? data.length : 0} resultados.`);

    // Verificar que tenemos datos para enviar a n8n
    if (!data || (Array.isArray(data) && data.length === 0)) {
      console.log('No se encontraron datos para enviar a n8n.');
      return res.json({ success: false, message: 'No se encontraron datos', data: [] });
    }

    // Enviar la data al flujo de n8n
    try {
      const n8nWebhookUrl = 'https://n8n.sitemaster.lat/webhook/leotest';
      console.log('Enviando datos a n8n:', n8nWebhookUrl);
      console.log('Cantidad de datos a enviar:', Array.isArray(data) ? data.length : 1);
      
      // Asegurar que enviamos un objeto JSON válido
      const dataToSend = Array.isArray(data) ? data : [data];
      
      const n8nResponse = await axios.post(n8nWebhookUrl, dataToSend, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Respuesta de n8n:', n8nResponse.status, n8nResponse.statusText);
      console.log('Datos enviados exitosamente al flujo de n8n');
    } catch (n8nError) {
      console.error('Error al enviar datos a n8n:', n8nError.message);
      // Continuamos y respondemos al cliente incluso si falla el envío a n8n
    }

    // Responder al cliente
    res.json({ success: true, count: Array.isArray(data) ? data.length : 1, data });
  } catch (error) {
    console.error('Error en scraping o envío a n8n:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Servidor corriendo en el puerto ${port}`);
});