// screenshotManager.js - Gestión de capturas de pantalla
const fs = require('fs');
const path = require('path');

function initScreenshotDir() {
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir);
  }
  return screenshotDir;
}

async function takeScreenshot(page, dirPath, name) {
    try {
        const fileName = `${name}_${new Date().toISOString().replace(/:/g, '-')}.png`;
        const filePath = path.join(dirPath, fileName);
        await page.screenshot({ path: filePath });
        console.log(`Captura guardada como: ${fileName}`);
        return filePath;
    } catch (error) {
        console.error(`Error al tomar captura ${name}:`, error.message);
        return null;
    }
}

module.exports = {
    initScreenshotDir,
    takeScreenshot
};