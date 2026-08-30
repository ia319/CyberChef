const RECIPE_PATCH_MAX_COMMANDS = 20;
const RECIPE_PATCH_MAX_ARGUMENTS = 32;
const RECIPE_PATCH_MAX_ARGUMENT_CODE_POINTS = 16 * 1024;
const RECIPE_PATCH_MAX_OPERATION_CODE_POINTS = 128;
const RECIPE_STEP_ID_MAX_CODE_POINTS = 64;
const RECIPE_STEP_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

const RECIPE_PATCH_ERROR_CODE = Object.freeze({
    INVALID_RECIPE: "INVALID_RECIPE",
    INVALID_PATCH: "INVALID_PATCH",
    INVALID_COMMAND: "INVALID_COMMAND",
    STEP_NOT_FOUND: "STEP_NOT_FOUND",
    ANCHOR_NOT_FOUND: "ANCHOR_NOT_FOUND",
    SAME_STEP_AND_ANCHOR: "SAME_STEP_AND_ANCHOR",
    ARGUMENT_OUT_OF_RANGE: "ARGUMENT_OUT_OF_RANGE",
    DUPLICATE_STEP_ID: "DUPLICATE_STEP_ID",
});

const COMMAND_PROPERTIES = Object.freeze({
    insert: Object.freeze(["type", "operation", "arguments", "beforeStepId", "afterStepId"]),
    remove: Object.freeze(["type", "stepId"]),
    move: Object.freeze(["type", "stepId", "beforeStepId", "afterStepId"]),
    enable: Object.freeze(["type", "stepId"]),
    disable: Object.freeze(["type", "stepId"]),
    setBreakpoint: Object.freeze(["type", "stepId", "enabled"]),
    setArgument: Object.freeze(["type", "stepId", "argumentIndex", "value"]),
});


/**
 * Represents a bounded Recipe patch failure without including submitted values.
 */
class RecipePatchError extends Error {
    /**
     * Creates a Recipe patch error.
     *
     * @param {string} code - Fixed error code.
     * @param {number|null} [commandIndex=null] - Failing command position.
     */
    constructor(code, commandIndex=null) {
        super("Recipe patch could not be applied");
        this.name = "RecipePatchError";
        this.code = code;
        this.commandIndex = commandIndex;
    }
}


/**
 * Checks whether a value is a plain data record.
 *
 * @param {*} value - Candidate record.
 * @returns {boolean} Whether the value is a plain record.
 */
function isPlainRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}


/**
 * Checks a stable Recipe step identifier.
 *
 * @param {*} stepId - Candidate step identifier.
 * @returns {boolean} Whether the identifier is valid.
 */
function isStepId(stepId) {
    return typeof stepId === "string" && stepId.length > 0 &&
        [...stepId].length <= RECIPE_STEP_ID_MAX_CODE_POINTS && RECIPE_STEP_ID_PATTERN.test(stepId);
}


/**
 * Copies the supported Recipe configuration shape.
 *
 * @param {*} step - Trusted model step candidate.
 * @returns {Object} Mutable patch step.
 */
function copyRecipeStep(step) {
    if (!isPlainRecord(step) || !isStepId(step.stepId) || !isPlainRecord(step.operation) ||
        typeof step.operation.op !== "string" || !Array.isArray(step.operation.args)) {
        throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_RECIPE);
    }

    const operation = {
        op: step.operation.op,
        args: [...step.operation.args],
    };
    if (step.operation.disabled === true) operation.disabled = true;
    if (step.operation.breakpoint === true) operation.breakpoint = true;
    return {stepId: step.stepId, operation};
}


/**
 * Validates an Agent-supported argument value.
 *
 * @param {*} value - Candidate argument value.
 * @returns {boolean} Whether the value is supported.
 */
function isPatchArgument(value) {
    return typeof value === "boolean" ||
        typeof value === "number" && Number.isFinite(value) ||
        typeof value === "string" && [...value].length <= RECIPE_PATCH_MAX_ARGUMENT_CODE_POINTS;
}


/**
 * Rejects missing, extra, inherited, and accessor command properties.
 *
 * @param {*} command - Candidate command.
 * @param {string[]} allowedProperties - Properties allowed for the command type.
 * @param {string[]} requiredProperties - Properties required for the command type.
 * @param {number} commandIndex - Command position.
 */
function validateCommandProperties(command, allowedProperties, requiredProperties, commandIndex) {
    if (!isPlainRecord(command)) {
        throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, commandIndex);
    }

    const descriptors = Object.getOwnPropertyDescriptors(command),
        keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== "string" || !allowedProperties.includes(key) ||
        !descriptors[key].enumerable || !("value" in descriptors[key])) ||
        requiredProperties.some(key => !Object.prototype.hasOwnProperty.call(descriptors, key))) {
        throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, commandIndex);
    }
}


/**
 * Finds one step or throws a bounded command error.
 *
 * @param {Object[]} steps - Mutable patch steps.
 * @param {string} stepId - Target step identifier.
 * @param {number} commandIndex - Command position.
 * @param {string} errorCode - Missing-step error code.
 * @returns {number} Matching step index.
 */
function findStepIndex(steps, stepId, commandIndex, errorCode) {
    if (!isStepId(stepId)) {
        throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, commandIndex);
    }
    const index = steps.findIndex(step => step.stepId === stepId);
    if (index < 0) throw new RecipePatchError(errorCode, commandIndex);
    return index;
}


/**
 * Resolves an exclusive before/after anchor.
 *
 * @param {Object} command - Insert or move command.
 * @param {Object[]} steps - Mutable patch steps.
 * @param {number} commandIndex - Command position.
 * @returns {{index: number, stepId: string}|null} Insertion point and anchor identity.
 */
function resolveAnchor(command, steps, commandIndex) {
    const before = Object.prototype.hasOwnProperty.call(command, "beforeStepId"),
        after = Object.prototype.hasOwnProperty.call(command, "afterStepId");
    if (before === after) {
        if (!before && command.type === "insert") return null;
        throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, commandIndex);
    }

    const stepId = before ? command.beforeStepId : command.afterStepId,
        anchorIndex = findStepIndex(
            steps,
            stepId,
            commandIndex,
            RECIPE_PATCH_ERROR_CODE.ANCHOR_NOT_FOUND
        );
    return {
        index: before ? anchorIndex : anchorIndex + 1,
        stepId,
    };
}


/**
 * Applies ordered Recipe commands to a detached model snapshot.
 *
 * Insert commands must already contain normalized arguments. The caller owns Operation
 * defaults, Ingredient validation, capability policy, and final model publication.
 *
 * @param {Object} snapshot - Trusted Recipe model snapshot.
 * @param {Object[]} commands - Ordered normalized patch commands.
 * @param {Function} createStepId - Side-effect-free identifier source for this draft.
 * @returns {Object} Detached post-patch steps and inserted identities.
 * @throws {RecipePatchError} When the snapshot or any command is invalid.
 */
function applyRecipePatch(snapshot, commands, createStepId) {
    if (!isPlainRecord(snapshot) || !Array.isArray(snapshot.steps)) {
        throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_RECIPE);
    }
    if (!Array.isArray(commands) || commands.length < 1 ||
        commands.length > RECIPE_PATCH_MAX_COMMANDS || typeof createStepId !== "function") {
        throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_PATCH);
    }

    const steps = snapshot.steps.map(copyRecipeStep),
        stepIds = new Set(steps.map(step => step.stepId)),
        insertedSteps = [],
        actions = [];
    if (stepIds.size !== steps.length) {
        throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_RECIPE);
    }

    for (let commandIndex = 0; commandIndex < commands.length; commandIndex++) {
        const command = commands[commandIndex],
            type = isPlainRecord(command) ? command.type : null,
            allowedProperties = typeof type === "string" &&
                Object.prototype.hasOwnProperty.call(COMMAND_PROPERTIES, type) ?
                COMMAND_PROPERTIES[type] : null;
        if (!allowedProperties) {
            throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, commandIndex);
        }

        if (type === "insert") {
            validateCommandProperties(
                command,
                allowedProperties,
                ["type", "operation", "arguments"],
                commandIndex
            );
            if (typeof command.operation !== "string" || command.operation.length < 1 ||
                [...command.operation].length > RECIPE_PATCH_MAX_OPERATION_CODE_POINTS ||
                !Array.isArray(command.arguments) ||
                command.arguments.length > RECIPE_PATCH_MAX_ARGUMENTS ||
                !command.arguments.every(isPatchArgument)) {
                throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, commandIndex);
            }

            const anchor = resolveAnchor(command, steps, commandIndex),
                stepId = createStepId();
            if (!isStepId(stepId)) {
                throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, commandIndex);
            }
            if (stepIds.has(stepId)) {
                throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.DUPLICATE_STEP_ID, commandIndex);
            }

            const step = {
                stepId,
                operation: {op: command.operation, args: [...command.arguments]},
            };
            steps.splice(anchor?.index ?? steps.length, 0, step);
            stepIds.add(stepId);
            insertedSteps.push(Object.freeze({commandIndex, stepId}));
            actions.push(Object.freeze({
                commandIndex,
                type,
                operationName: command.operation,
                stepId,
            }));
            continue;
        }

        if (type === "move") {
            validateCommandProperties(
                command,
                allowedProperties,
                ["type", "stepId"],
                commandIndex
            );
            const targetIndex = findStepIndex(
                    steps,
                    command.stepId,
                    commandIndex,
                    RECIPE_PATCH_ERROR_CODE.STEP_NOT_FOUND
                ),
                anchor = resolveAnchor(command, steps, commandIndex);
            if (command.stepId === anchor.stepId) {
                throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.SAME_STEP_AND_ANCHOR, commandIndex);
            }
            const [step] = steps.splice(targetIndex, 1),
                insertionIndex = findStepIndex(
                    steps,
                    anchor.stepId,
                    commandIndex,
                    RECIPE_PATCH_ERROR_CODE.ANCHOR_NOT_FOUND
                ) + (Object.prototype.hasOwnProperty.call(command, "afterStepId") ? 1 : 0);
            steps.splice(insertionIndex, 0, step);
            actions.push(Object.freeze({
                commandIndex,
                type,
                operationName: step.operation.op,
                stepId: step.stepId,
            }));
            continue;
        }

        validateCommandProperties(command, allowedProperties, ["type", "stepId"], commandIndex);
        const stepIndex = findStepIndex(
                steps,
                command.stepId,
                commandIndex,
                RECIPE_PATCH_ERROR_CODE.STEP_NOT_FOUND
            ),
            step = steps[stepIndex];

        if (type === "remove") {
            steps.splice(stepIndex, 1);
        } else if (type === "enable") {
            delete step.operation.disabled;
        } else if (type === "disable") {
            step.operation.disabled = true;
        } else if (type === "setBreakpoint") {
            if (typeof command.enabled !== "boolean") {
                throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, commandIndex);
            }
            if (command.enabled) step.operation.breakpoint = true;
            else delete step.operation.breakpoint;
        } else if (type === "setArgument") {
            if (!Number.isSafeInteger(command.argumentIndex) || command.argumentIndex < 0 ||
                command.argumentIndex >= RECIPE_PATCH_MAX_ARGUMENTS || !isPatchArgument(command.value)) {
                throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.INVALID_COMMAND, commandIndex);
            }
            if (command.argumentIndex >= step.operation.args.length) {
                throw new RecipePatchError(RECIPE_PATCH_ERROR_CODE.ARGUMENT_OUT_OF_RANGE, commandIndex);
            }
            step.operation.args[command.argumentIndex] = command.value;
        }
        actions.push(Object.freeze({
            commandIndex,
            type,
            operationName: step.operation.op,
            stepId: step.stepId,
        }));
    }

    return Object.freeze({
        steps: Object.freeze(steps.map(step => Object.freeze({
            stepId: step.stepId,
            operation: Object.freeze({
                ...step.operation,
                args: Object.freeze([...step.operation.args]),
            }),
        }))),
        insertedSteps: Object.freeze(insertedSteps),
        actions: Object.freeze(actions),
    });
}

export {
    RECIPE_PATCH_ERROR_CODE,
    RECIPE_PATCH_MAX_ARGUMENTS,
    RECIPE_PATCH_MAX_ARGUMENT_CODE_POINTS,
    RECIPE_PATCH_MAX_COMMANDS,
    RecipePatchError,
    applyRecipePatch,
};
