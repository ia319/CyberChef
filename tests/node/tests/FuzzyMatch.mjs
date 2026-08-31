import assert from "assert";
import { fuzzyMatch } from "../../../src/core/lib/FuzzyMatch.mjs";
import TestRegister from "../../lib/TestRegister.mjs";
import it from "../assertionHandler.mjs";


TestRegister.addApiTests([
    it("FuzzyMatch: should evaluate recursive name matches", () => {
        const [matched, score, indexes] = fuzzyMatch("foo", "Foo One");

        assert.equal(matched, true);
        assert.equal(Number.isFinite(score), true);
        assert.deepStrictEqual(indexes.map(index => "Foo One"[index].toLowerCase()), [..."foo"]);
        assert.equal(indexes.every((index, position) => position === 0 || index > indexes[position - 1]), true);
    }),
]);
