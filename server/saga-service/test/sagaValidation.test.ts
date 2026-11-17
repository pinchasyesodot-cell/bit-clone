import { sagaValidationSchema } from "../src/validations/saga.validation.js";

const validate = (payload: unknown) => sagaValidationSchema.validate(payload, { abortEarly: false });

describe("sagaValidationSchema", () => {
    it.each([
        ["a regular amount", { receiverId: "987654321", amount: 100 }],
        ["the smallest amount (one agora)", { receiverId: "987654321", amount: 0.01 }],
        ["two decimal places", { receiverId: "987654321", amount: 10.25 }],
        ["the maximum amount", { receiverId: "987654321", amount: 1_000_000 }],
        ["a receiverId with surrounding spaces (trimmed)", { receiverId: " 987654321 ", amount: 5 }],
    ])("accepts %s", (_label, payload) => {
        expect(validate(payload).error).toBeUndefined();
    });

    it.each([
        ["an empty body", {}],
        ["a missing receiverId", { amount: 100 }],
        ["a missing amount", { receiverId: "987654321" }],
        ["a receiverId that is too short", { receiverId: "12345", amount: 100 }],
        ["a receiverId that is too long", { receiverId: "9876543210", amount: 100 }],
        ["an empty receiverId", { receiverId: "", amount: 100 }],
        ["a receiverId that is a number", { receiverId: 987654321, amount: 100 }],
        ["an amount of zero", { receiverId: "987654321", amount: 0 }],
        ["a negative amount", { receiverId: "987654321", amount: -5 }],
        ["an amount sent as a string", { receiverId: "987654321", amount: "100" }],
        ["an amount with three decimal places", { receiverId: "987654321", amount: 10.256 }],
        ["an amount above the maximum", { receiverId: "987654321", amount: 1_000_000.01 }],
        ["a null amount", { receiverId: "987654321", amount: null }],
        ["a boolean amount", { receiverId: "987654321", amount: true }],
    ])("rejects %s", (_label, payload) => {
        expect(validate(payload).error).toBeDefined();
    });

    it("rejects a client-supplied senderId (the sender must come from the token)", () => {
        const { error } = validate({ senderId: "111111111", receiverId: "987654321", amount: 100 });
        expect(error?.message).toMatch(/senderId/);
    });

    it("rejects a client-supplied status", () => {
        const { error } = validate({ receiverId: "987654321", amount: 100, status: "COMPLETED" });
        expect(error?.message).toMatch(/status/);
    });

    it("reports every problem at once when abortEarly is off", () => {
        const { error } = validate({ receiverId: "1", amount: -1 });
        expect(error?.details.length).toBe(2);
    });
});
