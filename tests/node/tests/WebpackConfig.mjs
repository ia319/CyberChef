import assert from "assert";
import webpackConfig from "../../../webpack.config.js";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";

const babelRule = webpackConfig.module.rules.find(rule => rule.loader === "babel-loader"),
    fontRule = webpackConfig.module.rules.find(rule => rule.generator?.filename === "assets/fonts/[name][ext]"),
    thirdPartyImageRule = webpackConfig.module.rules.find(rule => rule.type === "asset/inline" && rule.include);

TestRegister.addApiTests([
    it("Webpack config: should exclude third-party JavaScript on every supported path format", () => {
        assert.equal(babelRule.exclude.test("C:\\workspace\\node_modules\\jimp\\dist\\browser\\index.js"), true);
        assert.equal(babelRule.exclude.test("/workspace/node_modules/jimp/dist/browser/index.js"), true);
        assert.equal(babelRule.exclude.test("C:\\workspace\\node_modules\\crypto-api\\src\\index.mjs"), false);
        assert.equal(babelRule.exclude.test("/workspace/node_modules/bootstrap/js/index.js"), false);
    }),

    it("Webpack config: should load bitmap fonts on every supported path format", () => {
        assert.equal(fontRule.test.test("C:\\workspace\\src\\fonts\\bmfonts\\Roboto72White.png"), true);
        assert.equal(fontRule.test.test("/workspace/src/fonts/bmfonts/Roboto72White.png"), true);
    }),

    it("Webpack config: should inline third-party images on every supported path format", () => {
        assert.equal(thirdPartyImageRule.include.test("C:\\workspace\\node_modules\\package\\image.png"), true);
        assert.equal(thirdPartyImageRule.include.test("/workspace/node_modules/package/image.png"), true);
    }),
]);
