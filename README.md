# CyberChef WebMCP Fork

This fork adds WebMCP support to CyberChef. A user and an Agent can search for Operations, change a Recipe, run a Bake, and use Output analysis to continue refining the Recipe on the same visible page. CyberChef performs data transformation and analysis locally in the browser.

> [!NOTE]
> ia319 maintains this experimental fork. Official CyberChef releases remain available from the upstream repository.
>
> - **Live app:** [ia319.github.io/CyberChef](https://ia319.github.io/CyberChef/)
> - **Fork:** [github.com/ia319/CyberChef](https://github.com/ia319/CyberChef)
> - **Upstream:** [github.com/gchq/CyberChef](https://github.com/gchq/CyberChef)
> - **Upstream baseline:** [`2e048b0`](https://github.com/gchq/CyberChef/commit/2e048b0290854781db61e20638dca62978379032), `fix: accept hexadecimal values for Disassemble x86 address arguments (#2721)`, 20 August 2026
> - **Licence:** [Apache 2.0](./LICENSE), with the upstream copyright notices preserved
> - **Human review:** Human code review coverage for the added and modified code remains limited

The original CyberChef features, examples, Node API documentation, and contribution guide remain available in the [upstream README](https://github.com/gchq/CyberChef#readme).

## WebMCP support

CyberChef registers six fixed workflow tools with the WebMCP host. `search_operations` and `get_operation_details` provide on-demand access to the complete Operation catalog.

### Tools

| Tool | Function | Authorization and effect |
| --- | --- | --- |
| `search_operations` | Searches the fixed Operation catalog by name and description. Returns fixed metadata, access classification, and supported Recipe actions. | Available while collaboration is off; reads catalog data only. |
| `get_operation_details` | Returns defaults, argument types, fixed options, constraints, and access classification for one Operation. | Available while collaboration is off; reads catalog data only. |
| `get_recipe_state` | Returns `recipeRevision` and a paginated list of Recipe steps. Each step contains `stepId`, `operationName`, `enabled`, `breakpoint`, and `argumentStates`; each argument state contains its index and `configured` status. | Requires an active WebMCP collaboration session; reads Recipe structure only. |
| `apply_recipe_patch` | Applies a set of Recipe changes at `expectedRevision`, or applies a Magic candidate stored by the page. | Requires an active WebMCP collaboration session; changes the visible Recipe. |
| `bake_recipe` | Runs the active Input with the specified Recipe revision, or waits for the matching run to finish. | Requires an active WebMCP collaboration session; uses local compute resources and updates the visible Output. |
| `inspect_output` | Runs Magic analysis on the first 1,000 bytes of the current Output identified by `bakeId`. Returns type, entropy, language, format matches, candidate Operation names, and Magic candidate references. | Requires an active WebMCP collaboration session. A session can start up to eight new analyses; cached results and requests that join an active analysis consume no additional allowance. |

### Operation access

The product catalog contains 503 Operations. The access audit covers all 504 generated Operation entries, including one internal test Operation.

- **447 `direct`:** The Agent can change the Recipe and request a Bake during an active collaboration session.
- **51 `approval`:** The approval service first creates a single-use approval request. After approval, the Agent can submit the Recipe change bound to that request. The user may also approve one Bake for the resulting Recipe.
- **5 `blocked`:** Requests to insert `Magic`, `Parse colour code`, `Render Markdown`, `Scatter chart`, or `Series chart` are rejected.
- **1 `excluded`:** `Automated Validation Test Op` is reserved for internal tests and omitted from the product catalog.

Operation names, defaults, argument shapes, fixed options, and basic validation use CyberChef's generated Operation configuration and core `Ingredient` validation.

An Operation added upstream starts with the `unreviewed` classification. Recipe changes and Agent-requested Bakes remain disabled for that Operation until its access review is complete.

One approval request can cover multiple `approval` Operations in the complete Recipe. The approval panel lists every enabled `approval` Operation in the proposed Recipe, the requested Recipe change types, and the applicable side-effect categories. Argument values remain hidden.

The approval text for `Register` states that the Operation captures data from Input and writes captured values into later Operation arguments.

### User and Agent workflow

1. The user selects **Start** on the page to create a WebMCP collaboration session.
2. The Agent calls `search_operations` and `get_operation_details` to find Operations and read their argument definitions.
3. The Agent calls `get_recipe_state` to obtain the current `recipeRevision` and each step's `stepId`.
4. The Agent calls `apply_recipe_patch` with `insert`, `remove`, `move`, `enable`, `disable`, `setBreakpoint`, or `setArgument` changes.
5. The Recipe transaction applies every change to a copy and validates the complete resulting Recipe.
6. After validation succeeds, the transaction updates the Recipe model, visible Recipe DOM, and `recipeRevision` together. The page displays an Agent change summary and stores one in-memory snapshot of the preceding Recipe.
7. When the complete Recipe contains an `approval` Operation, the approval service creates a single-use approval request. The page displays the Operation names, change types, and side-effect descriptions.
8. The user selects **Apply Recipe change**, **Apply and Bake once**, or **Reject**.
9. The Agent resubmits the same change with the approval request ID. The Recipe transaction consumes the Recipe authorization and commits the bound Recipe.
10. After the user approves one Bake, the Agent calls `bake_recipe` to consume the Bake authorization. The authorization applies only to the Recipe, Input, execution options, and Output tab recorded at approval time.
11. The run coordinator assigns a `bakeId` and records the Recipe revision, Input version, execution options version, and Output tab.
12. When the Bake settles, `bake_recipe` reports completed, paused, failed, cancelled, timed out, or superseded status.
13. After a completed Bake, the Agent calls `inspect_output` with the returned `bakeId`.
14. The user can continue editing the Recipe, cancel the run, or select **Stop** to end collaboration.

The Recipe transaction rejects an Agent change whose revision differs from the current `recipeRevision`. After a user edit, the Agent reads Recipe state again before submitting another change.

The Output coordinator accepts Worker results only when the Recipe, Input, execution options, Output tab, and `bakeId` match the current run. The Output coordinator discards Worker messages and Magic results whose recorded run identities differ from the current run.

Revert stores the in-memory snapshot that preceded the latest Agent change. Any later Recipe change invalidates that snapshot.

### Magic analysis and candidates

`inspect_output` supports the following optional fields:

| Field | Default | Accepted value | Function |
| --- | --- | --- | --- |
| `depth` | `3` | Integer from `0` to `3` | Sets the recursive Magic analysis depth. |
| `intensiveMode` | `false` | Boolean | Enables XOR, bit rotation, and character encoding analysis. |
| `extensiveLanguageSupport` | `false` | Boolean | Enables comparison with the extended language set. |
| `crib` | `""` | Valid regular expression up to 128 characters | Retains case-insensitive matching candidates. |

The page analyzes the first 1,000 bytes of Output. The result contains:

- run identifiers: `analysisId`, `analysisState`, `bakeId`, `recipeRevision`, `inputTabId`, `inputGeneration`, `inputRevision`, `executionOptionsVersion`, `outputTabId`, `outputGeneration`, and `outputVersion`
- analysis signals: `isUtf8`, `detectedTypeId`, `entropyBand`, and `topLanguageId`
- `matchingOperationNames`, with at most three format-matching Operation names
- `candidateOperationNames`, with at most three Operation names from the highest-ranked candidate Recipe

The page stores each complete Magic candidate Recipe and its argument values in memory. `inspect_output` returns at most five `candidates`. Each candidate contains:

- `candidateId`
- rank
- `operationNames`, containing one to three ordered Operation names

`candidates[].candidateId` references a candidate Recipe that includes its complete arguments.

When the Agent passes a `candidateId` to `apply_recipe_patch`, the page reads the corresponding candidate Recipe and converts it into ordinary Recipe changes. Those changes use the same Operation access checks, single-use approval, core argument validation, Recipe transaction, revision update, change summary, and Revert rules.

The following events invalidate stored `candidateId` values:

- the WebMCP collaboration session ends
- the page refreshes or closes
- the Recipe changes
- Input changes
- the execution options change
- Output updates
- the active Input tab changes
- the active Output tab changes
- the current run is cancelled or superseded

### Authorization and data scope

`get_recipe_state`, `apply_recipe_patch`, `bake_recipe`, and `inspect_output` execute only during an active WebMCP collaboration session.

WebMCP tool results use field allowlists. Results are limited to:

- fixed Operation catalog metadata
- Recipe step structure and revision
- Recipe change status
- Bake status and run identifiers
- Output type, UTF-8 status, entropy band, language, and Magic Operation names
- Magic candidate IDs, ranks, and Operation names

The following data stays outside WebMCP tool results:

- raw Input
- raw Output
- current Recipe argument values
- Comment text
- Register captures
- arguments produced by Register substitution
- Magic previews
- Magic candidate arguments
- Worker objects and internal stack traces

Stop, page refresh, page close, and navigation end the collaboration session. They also invalidate unfinished invocations, approval requests, and Magic candidates.

Recipe execution, Magic analysis, approval state, and WebMCP handlers run in the page and CyberChef's existing Web Workers. The integration architecture consists of these browser-side components. Telemetry and remote transformation services remain outside the integration scope.

#### Browser host context

WebMCP tool allowlists cover tool metadata and results. The browser or Agent host may separately provide the page URL, title, screenshots, and visible content to the model.

CyberChef can store Recipe arguments and reversibly encoded Input in the URL fragment. Before processing sensitive data, disable **Update the URL when the input or recipe changes** and use a clean URL without `#recipe=` or `#input=`. Remaining page observation follows the host's privacy policy.

### Design decisions

| Decision | Implementation | Reason |
| --- | --- | --- |
| Register six workflow tools | Six fixed tools cover Operation search, Recipe changes, Bake, and Output analysis. | A fixed tool count controls discovery context while preserving access to the complete Operation catalog. |
| Keep tool registration stable | Tool names, titles, descriptions, and schemas use fixed text. The collaboration session controls invocation. | WebMCP discovery and invocation occur at separate stages. Fixed registration keeps page state out of tool metadata. |
| Reuse CyberChef argument rules | Operation arguments use generated configuration and `Ingredient` validation. | Agent changes and Recipes created through the page follow the same argument semantics. |
| Use Recipe transactions | A transaction prepares changes on a copy, then updates the model, DOM, and `recipeRevision` together. | The user and Agent share one Recipe, so validation, conflict handling, and restoration use one commit path. |
| Record the source of every run | Each run records Recipe revision, Input version, execution options version, Output tab, and `bakeId`. | Worker and Magic results update only the Output associated with their originating run. |
| Use single-use approvals | An approval binds the Recipe, Input, Output tab, Operation names, change types, sensitive parameter names, risk categories, and expiration time. | Network, signing, key generation, presentation, nondeterministic, and flow-control Operations require user confirmation. |
| Store Magic arguments behind `candidateId` | Complete candidates remain in page memory. Tool results return only candidate IDs and Operation names. | The Agent can apply the exact candidate while argument values remain on the page. |
| Keep processing in the browser | Recipe execution, Bake, Magic, and WebMCP handlers run on the page. | CyberChef remains deployable in closed networks and offline environments. |

## Run and verify

### Requirements

- Node.js `>=24 <27`
- a WebMCP host that provides `document.modelContext.registerTool`
- `http://localhost:8080` for local development
- HTTPS for the deployed site

The Chrome test environment enables WebMCP through:

```text
chrome://flags/#enable-webmcp-testing
```

Set **WebMCP for testing** to **Enabled**, then restart Chrome.

When `document.modelContext.registerTool` is unavailable, the page loads the standard CyberChef interface and skips WebMCP tool registration.

### Use the live app

1. Enable Chrome's **WebMCP for testing** flag.
2. Restart Chrome.
3. Open [ia319.github.io/CyberChef](https://ia319.github.io/CyberChef/).
4. Prepare data in the Input area.
5. Select **Start** in the **WebMCP Recipe access** panel.
6. Discover and invoke the six tools from the WebMCP host.
7. Select **Stop** when the session is complete.

Stop ends the current collaboration session. Recipe changes already committed to the page remain visible.

### Run from source

```bash
git clone https://github.com/ia319/CyberChef.git
cd CyberChef
npm install
npm start
```

`npm install` installs project dependencies in `node_modules`.

`npm start` starts the development server with live reload:

```text
http://localhost:8080
```

Open the page, then select **Start** in the **WebMCP Recipe access** panel.

### Build production assets

```bash
npm run build
```

The build writes production assets to:

```text
build/prod
```

### Run the WebMCP browser tests

Build the production assets first, then run:

```bash
npm run testwebmcp
```

This command starts the production test server and Chrome test process, then runs `tests/browser/04_webmcp.js`.

### Other verification commands

| Command | Function |
| --- | --- |
| `npm test` | Runs the Node and Operation tests. |
| `npm run testnodeconsumer` | Verifies CommonJS and ESM Node consumers. |
| `npm run testui` | Runs the regular browser UI tests against the production build. |
| `npm run lint` | Runs the project lint checks. |

## WebMCP implementation

The following modules were added by this fork.

### WebMCP tools

- `src/web/webmcp/` defines tool contracts, input validation, result envelopes, Operation access classification, approval policy, tool handlers, Bake services, Output analysis, and Magic candidate storage.
- `src/web/waiters/WebMCPWaiter.mjs` connects to `document.modelContext.registerTool`, registers the fixed tools, and handles page load and teardown.
- `src/web/waiters/CollaborationWaiter.mjs` connects the Start, Stop, status, and Revert controls.
- `src/web/waiters/ApprovalWaiter.mjs` connects the single-use approval panel, keyboard focus, and status messages.

### Recipe

- `src/web/recipe/RecipeModel.mjs` stores Recipe steps and `recipeRevision`.
- `src/web/recipe/RecipePatch.mjs` applies Recipe change commands.
- `src/web/recipe/RecipeTransaction.mjs` validates and commits complete Recipe changes.
- `src/web/recipe/RecipeDOMProjection.mjs` builds the Recipe DOM before commit.
- `src/web/recipe/RecipeArgument.mjs` copies and validates Recipe argument shapes.

### Run and Output

- `src/core/ExecutionState.mjs` defines the core Recipe execution states used by the run coordinator.
- `src/web/run/ExecutionOptionsState.mjs` stores and versions snapshots of options that affect Recipe results.
- `src/web/run/RunCoordinator.mjs` manages run creation, waiting, cancellation, timeouts, and final status.
- `src/web/run/RunOutcome.mjs` converts Chef and Worker responses into fixed per-Input run results.
- `src/web/run/RunTargetBuilder.mjs` records the Recipe, Input, execution options, and Output tab.
- `src/web/run/OutputProvenance.mjs` stores Output source identifiers.
- `src/web/run/InputSyncController.mjs` commits pending Input editor changes before Bake.
- `src/web/run/WorkerActionPolicy.mjs` checks that Worker messages belong to the current run.
- `src/web/analysis/` manages Background Magic scheduling, caching, cancellation, and result invalidation.

### Interface and tests

- `src/web/stylesheets/layout/_collaboration.css` defines the collaboration session and approval panel styles.
- `nightwatch.conf.js` reads the Chrome executable from the environment.
- New Node, browser, and Operation tests cover tool contracts, Operation access, approvals, Recipe transactions, Input synchronization, run status, Output source identifiers, Magic analysis, and returned fields.

## Modified upstream files

This inventory compares upstream baseline `2e048b0` with WebMCP implementation merge `5bf6b8a8`. It covers all 40 files that existed in the upstream baseline and changed between those revisions.

### Build, CI, deployment, and documentation

- `.cspell.json` adds WebMCP terms and application event names.
- `.github/workflows/master.yml` installs Chrome 152, selects the Chrome executable, configures the runner sandbox, runs the regular UI and WebMCP tests, and deploys `build/prod` from the Node.js 24 job.
- `.github/workflows/master.yml` omits the upstream sitemap and GitHub Pages transformation tasks. The deployed assets exclude the analytics, canonical URL, and structured data added by those tasks.
- `.github/workflows/pull_requests.yml` uses the same Chrome 152, sandbox, UI test, and WebMCP test configuration for pull requests.
- `.github/workflows/releases.yml` restricts release and npm publish jobs to the `gchq/CyberChef` repository.
- `Gruntfile.js` adds the `testwebmcp` task and starts browser tests through `npx nightwatch`.
- `nightwatch.json` adds a test environment with the `WebMCPTesting` feature and separates the WebMCP suite from the regular UI suite.
- `package.json` and `package-lock.json` add the WebMCP test script and update ChromeDriver to version 152.
- `webpack.config.js` updates loader and asset rules to match Windows and POSIX path separators.
- `README.md` replaces the upstream project guide with this fork overview and links to the upstream documentation.

### Core runtime

- `src/core/Chef.mjs`, `src/core/ChefWorker.js`, and `src/core/Recipe.mjs` record Recipe execution results, carry `bakeId` and Recipe revision in Worker messages, await silent Bakes, and record the Operation responsible for presenting the current Dish.
- `src/core/Utils.mjs` stores debounce timers in a `Map` and provides cancellation by ID. Recipe transactions use this function to cancel an old Auto Bake before it starts.
- `src/core/config/scripts/generateConfig.mjs` writes each Operation's core Output type to the generated configuration.
- `src/core/dishTypes/DishListFile.mjs` stores the browser conversion of `List<File>` as an `ArrayBuffer`.
- `src/core/lib/FuzzyMatch.mjs` gives each recursive search branch its own match array so one branch cannot modify another branch's results.

### Web application integration

- `src/web/App.mjs` connects the Recipe transaction, synchronizes Input before Bake, coordinates manual and automatic Bakes, preserves Operation defaults when URL arguments are omitted, and provides the Revert entry point for the latest Agent change.
- `src/web/HTMLIngredient.mjs` marks Recipe argument event handlers and separates selector display changes from Recipe content changes.
- `src/web/Manager.mjs` creates the Recipe, Run, Analysis, Approval, Collaboration, and WebMCP services; connects the six tool handlers; and invalidates approval requests and Magic candidates when the Recipe, Input, Output tab, or session changes.
- `src/web/html/index.html` adds the WebMCP collaboration session, status, Revert, and single-use approval controls.
- `src/web/stylesheets/index.css` loads the collaboration panel styles.
- `src/web/waiters/BackgroundWorkerWaiter.mjs` binds Background Magic requests to Output source identifiers, stores Magic candidates, and creates a new Background Worker after a Worker failure.
- `src/web/waiters/BindingsWaiter.mjs` and `src/web/waiters/ControlsWaiter.mjs` send Recipe changes from keyboard and control actions through the Recipe transaction.
- `src/web/waiters/InputWaiter.mjs` commits Input editor changes before Bake, records Input versions, settles reads interrupted by Worker reset, and supplies Input identifiers to the run coordinator.
- `src/web/waiters/OutputWaiter.mjs` records Output versions, source identifiers, and display completion; supplies analysis data to `inspect_output`; and discards display results from other runs.
- `src/web/waiters/RecipeWaiter.mjs` synchronizes the Recipe model and DOM, commits user and Agent changes, checks `recipeRevision`, prevents conflicting commits during a run, and manages the change summary and Revert snapshot.
- `src/web/waiters/TabWaiter.mjs` assigns stable identifiers to Input and Output tabs and publishes an event when the active tab changes.
- `src/web/waiters/WorkerWaiter.mjs` manages run start, completion, cancellation, timeouts, Worker replacement, progress, silent Bake, and highlight messages. It discards messages whose `bakeId` or Recipe revision belongs to another run.
- `src/web/workers/InputWorker.mjs` records Input load state and versions, then carries `bakeId` and Recipe revision through multi-Input and Auto Bake scheduling.

### Tests and test utilities

- `tests/browser/00_nightwatch.js` closes the startup popover before the first Bake.
- `tests/browser/01_io.js` checks binary text from the `copy` event's `clipboardData` directly on Windows.
- `tests/browser/02_ops.js` verifies that `List<File>` Output converts to `ArrayBuffer`.
- `tests/browser/03_recipe_load.js` adds browser regressions for Recipe transactions, user and Agent conflicts, Revert, run identifiers, Worker failures, Magic analysis, and Output updates.
- `tests/browser/browserUtils.js` waits for the requested Bake Output to finish, handles Windows binary copy assertions, and loads Recipe and Input fixtures together through the URL.
- `tests/node/index.mjs` registers the added WebMCP, Recipe, Run, Analysis, and configuration tests.
- `tests/node/tests/Utils.mjs` verifies debounce cancellation by ID.
- `tests/operations/tests/CipherSaber2.mjs` checks CipherSaber2 encrypted byte lengths through an explicit hexadecimal result.
- `tests/operations/tests/FromDecimal.mjs` adds signed and unsigned `To Decimal` tests.

## Upstream project and licence

CyberChef is a client-side application for encryption, encoding, compression, parsing, and data analysis.

The original project, documentation, releases, security policy, and contribution process remain at [gchq/CyberChef](https://github.com/gchq/CyberChef).

This fork preserves the upstream [Apache 2.0 Licence](./LICENSE) and Crown Copyright notices.
