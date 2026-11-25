import { sagaResponseSchema } from "../src/validations/sagaResponse.validation.js";

const valid = {
    type: "DEBIT_RESPONSE",
    payload: { sagaId: "0193f2a4-6b1c-7d3e-a1b2-c3d4e5f60718", success: true },
};
const withPayload = (changes: Record<string, unknown>) => ({ ...valid, payload: { ...valid.payload, ...changes } });

describe("saga response validation", () => {
    it.each([
        ["a successful reply", valid],
        ["a rejection with a reason", withPayload({ success: false, error: "INSUFFICIENT_FUNDS" })],
        ["a reply with extra fields", withPayload({ handledAt: "2026-11-25T10:00:00Z" })],
    ])("accepts %s", (_case, message) => {
        expect(sagaResponseSchema.validate(message).error).toBeUndefined();
    });

    it.each([
        ["an unknown type", { ...valid, type: "TRANSFER_RESPONSE" }],
        ["a command instead of a reply", { ...valid, type: "DEBIT_COMMAND" }],
        ["a message without a payload", { type: "DEBIT_RESPONSE" }],
        ["a missing sagaId", withPayload({ sagaId: undefined })],
        ["a sagaId that is not a UUID", withPayload({ sagaId: "saga-1" })],
        ["a UUID v4 sagaId", withPayload({ sagaId: "0b8e4c1a-7f2d-4a51-9c3e-5d6f7a8b9c0d" })],
        ["success sent as a string", withPayload({ success: "false" })],
        ["a missing success", withPayload({ success: undefined })],
        ["an error that is not a string", withPayload({ success: false, error: 42 })],
    ])("rejects %s", (_case, message) => {
        expect(sagaResponseSchema.validate(message).error).toBeDefined();
    });
});
