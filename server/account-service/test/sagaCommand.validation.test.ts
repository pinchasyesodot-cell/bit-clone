import { commandSchema } from "../src/validations/sagaCommand.validation.js";

const schema = commandSchema("DEBIT_COMMAND");
const valid = {
    type: "DEBIT_COMMAND",
    payload: {
        sagaId: "0193f2a4-6b1c-7d3e-a1b2-c3d4e5f60718",
        senderId: "123456789",
        receiverId: "123456789",
        amount: 500,
        status: "PENDING",
    },
};
const withPayload = (changes: Record<string, unknown>) => ({ ...valid, payload: { ...valid.payload, ...changes } });

describe("saga command validation", () => {
    it("accepts a valid command", () => {
        expect(schema.validate(valid).error).toBeUndefined();
    });

    it.each([
        ["a negative amount (would add money to the sender)", withPayload({ amount: -500 })],
        ["a zero amount", withPayload({ amount: 0 })],
        ["a fractional amount", withPayload({ amount: 10.5 })],
        ["an empty sagaId", withPayload({ sagaId: "" })],
        ["a missing senderId", withPayload({ senderId: undefined })],
        ["a command sent to the wrong queue", { ...valid, type: "CREDIT_COMMAND" }],
        ["a message without a payload", { type: "DEBIT_COMMAND" }],
        ["a sagaId that is not a UUID", withPayload({ sagaId: "saga-1" })],
        ["a UUID v4 sagaId (saga-service creates v7)", withPayload({ sagaId: "0b8e4c1a-7f2d-4a51-9c3e-5d6f7a8b9c0d" })],
        ["a userId that is not 9 digits", withPayload({ senderId: "12345" })],
    ])("rejects %s", (_case, message) => {
        expect(schema.validate(message).error).toBeDefined();
    });
});
