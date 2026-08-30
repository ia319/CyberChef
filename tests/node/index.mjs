/* eslint no-console: 0 */

/**
 * Node API Test Runner
 *
 * @author d98762625 [d98762625@gmail.com]
 * @author tlwr [toby@toby.codes]
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2018
 * @license Apache-2.0
 */

import {
    setLongTestFailure,
    logTestReport,
} from "../lib/utils.mjs";

import TestRegister from "../lib/TestRegister.mjs";
import "./tests/nodeApi.mjs";
import "./tests/operations.mjs";
import "./tests/PGP.mjs";
import "./tests/File.mjs";
import "./tests/Dish.mjs";
import "./tests/NodeDish.mjs";
import "./tests/Utils.mjs";
import "./tests/Categories.mjs";
import "./tests/FuzzyMatch.mjs";
import "./tests/ToHTMLEntity.mjs";
import "./tests/lib/BigIntUtils.mjs";
import "./tests/lib/ChartsProtocolPrototypePollution.mjs";
import "./tests/OperationConfigTypes.mjs";
import "./tests/RecipeModel.mjs";
import "./tests/RecipePatch.mjs";
import "./tests/RecipeTransaction.mjs";
import "./tests/WorkerActionPolicy.mjs";
import "./tests/ParseQRCode.mjs";
import "./tests/WebpackConfig.mjs";
import "./tests/WebMCPCollaborationSession.mjs";
import "./tests/WebMCPCollaborationUI.mjs";
import "./tests/WebMCPWaiter.mjs";
import "./tests/WebMCPToolDefinitions.mjs";
import "./tests/WebMCPOperationCatalog.mjs";
import "./tests/WebMCPOperationToolHandlers.mjs";
import "./tests/WebMCPOperationCapabilityManifest.mjs";
import "./tests/WebMCPOperationIngredients.mjs";
import "./tests/WebMCPOperationProfiles.mjs";
import "./tests/WebMCPOperationPreflight.mjs";
import "./tests/WebMCPToolExecutor.mjs";
import "./tests/WebMCPToolInput.mjs";
import "./tests/WebMCPToolResult.mjs";

const testStatus = {
    allTestsPassing: true,
    counts: {
        total: 0,
    }
};

setLongTestFailure();

const logOpsTestReport = logTestReport.bind(null, testStatus);

(async function() {
    const results = await TestRegister.runApiTests();
    logOpsTestReport(results);
})();
