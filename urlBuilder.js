// urlBuilder.js
function buildUrl(params = {}) {
    const baseUrl = 'https://www.milanuncios.com/motor/';
    const url = new URL(baseUrl);
    Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
    });
    return url.toString();
}

module.exports = {
    buildUrl
};