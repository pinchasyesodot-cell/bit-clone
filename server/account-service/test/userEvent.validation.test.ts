import { userCreatedSchema } from "../src/validations/userEvent.validation.js";

const valid = { type: "USER_CREATED", payload: { userId: "123456789" } };

describe("user created event validation", () => {
    it("accepts a valid event", () => {
        expect(userCreatedSchema.validate(valid).error).toBeUndefined();
    });

    it.each([
        ["a numeric userId (must be sent as a string)", { ...valid, payload: { userId: 123456789 } }],
        ["a userId that is not 9 digits", { ...valid, payload: { userId: "12345" } }],
        ["a missing userId", { ...valid, payload: {} }],
        ["a different event type", { ...valid, type: "USER_DELETED" }],
    ])("rejects %s", (_case, message) => {
        expect(userCreatedSchema.validate(message).error).toBeDefined();
    });
});
