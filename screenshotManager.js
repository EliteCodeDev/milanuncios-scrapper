// screenshotManager.js - Gestión de capturas de pantalla
const fs = require('fs');
const path = require('path');

function initScreenshotDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath);
    }
    return dirPath;
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