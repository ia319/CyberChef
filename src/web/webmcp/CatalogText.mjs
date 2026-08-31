const OPERATION_DESCRIPTION_MAX_CODE_POINTS = 240;

const HTML_ENTITY_VALUES = Object.freeze({
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
});


/**
 * Decodes the HTML entities used by fixed catalog text without a DOM.
 *
 * @param {string} value - Text containing named or numeric HTML entities.
 * @returns {string} Text with supported entities decoded.
 */
function decodeHtmlEntities(value) {
    return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu, (entity, decimal, hexadecimal, named) => {
        if (named) return HTML_ENTITY_VALUES[named.toLowerCase()] ?? entity;

        const codePoint = Number.parseInt(decimal ?? hexadecimal, decimal ? 10 : 16);
        if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff ||
            codePoint >= 0xd800 && codePoint <= 0xdfff) {
            return "";
        }
        return String.fromCodePoint(codePoint);
    });
}


/**
 * Removes HTML tags without treating quoted greater-than characters as tag endings.
 *
 * @param {string} value - Fixed catalog HTML.
 * @returns {string} Text and whitespace outside tags.
 */
function stripHtmlTags(value) {
    const text = [];
    let inTag = false,
        quote = null;

    for (const character of value) {
        if (!inTag) {
            if (character === "<") {
                inTag = true;
                text.push(" ");
            } else {
                text.push(character);
            }
            continue;
        }

        if (quote !== null) {
            if (character === quote) quote = null;
        } else if (character === "\"" || character === "'") {
            quote = character;
        } else if (character === ">") {
            inTag = false;
        }
    }
    return text.join("");
}


/**
 * Converts fixed catalog HTML into bounded plain text.
 *
 * @param {*} value - Fixed catalog text.
 * @param {number} maxCodePoints - Maximum returned Unicode code points.
 * @returns {string} Sanitized and bounded plain text.
 */
function sanitizeCatalogText(value, maxCodePoints) {
    if (!Number.isInteger(maxCodePoints) || maxCodePoints < 1) {
        throw new RangeError("Catalog text limit must be a positive integer");
    }

    const source = typeof value === "string" ? value : "",
        withoutActiveContent = source
            .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, " ")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/giu, " "),
        plainText = decodeHtmlEntities(stripHtmlTags(withoutActiveContent))
            .replace(/\s+/gu, " ")
            .trim(),
        codePoints = [...plainText];

    if (codePoints.length <= maxCodePoints) return plainText;
    if (maxCodePoints === 1) return "…";
    return codePoints.slice(0, maxCodePoints - 1).join("") + "…";
}


/**
 * Converts a fixed Operation description into bounded plain text.
 *
 * @param {*} description - Description from generated configuration.
 * @returns {string} Sanitized Operation description.
 */
function sanitizeOperationDescription(description) {
    return sanitizeCatalogText(description, OPERATION_DESCRIPTION_MAX_CODE_POINTS);
}

export {
    OPERATION_DESCRIPTION_MAX_CODE_POINTS,
    sanitizeCatalogText,
    sanitizeOperationDescription,
};
