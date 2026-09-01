const config = require("./nightwatch.json");

const chromeBinary = process.env.CYBERCHEF_TEST_CHROME_BINARY;

if (chromeBinary) {
    // eslint-disable-next-line camelcase
    config.test_settings.default.webdriver.chrome_binary = chromeBinary;
}

module.exports = config;
