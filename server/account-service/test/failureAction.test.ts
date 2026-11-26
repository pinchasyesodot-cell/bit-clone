import { failureAction } from "../src/config/rabbitmq.js";
import { InvalidMessageError } from "../src/utils/InvalidMessageError.js";

describe("failureAction", () => {
    it.each([
        ["a temporary error, first attempt", new Error("Mongo is down"), false, "requeue"],
        ["a temporary error, second attempt", new Error("Mongo is down"), true, "deadLetter"],
        ["an invalid message, first attempt", new InvalidMessageError("bad"), false, "deadLetter"],
        ["broken JSON, first attempt", new SyntaxError("Unexpected token"), false, "deadLetter"],
    ] as const)("%s", (_case, error, redelivered, expected) => {
        expect(failureAction(error, redelivered)).toBe(expected);
    });
});
