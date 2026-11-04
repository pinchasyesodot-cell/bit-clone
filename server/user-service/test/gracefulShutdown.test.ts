import { jest } from "@jest/globals";
import http from "node:http";
import type { AddressInfo } from "node:net";

jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { closeServer, registerGracefulShutdown } = await import("../src/utils/gracefulShutdown.js");

const listen = async (): Promise<http.Server> => {
    const server = http.createServer((_req, res) => res.end("ok"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return server;
};

describe("closeServer", () => {
    it("stops a server that is listening", async () => {
        const server = await listen();
        await closeServer(server);
        expect(server.listening).toBe(false);
    });

    it("does nothing when the server was already closed (Socket.IO closes it together with its clients)", async () => {
        const server = await listen();
        await closeServer(server);
        await expect(closeServer(server)).resolves.toBeUndefined();
    });

    it("does not wait for a client that keeps an idle connection open", async () => {
        const server = await listen();
        const { port } = server.address() as AddressInfo;
        const agent = new http.Agent({ keepAlive: true });
        await new Promise<void>((resolve) =>
            http.get({ host: "127.0.0.1", port, agent }, (res) => {
                res.resume();
                res.on("end", resolve);
            })
        );

        const started = Date.now();
        await closeServer(server);

        expect(Date.now() - started).toBeLessThan(1000);
        agent.destroy();
    });
});

const EVENTS = ["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"] as const;
type Event = (typeof EVENTS)[number];
const listenersOf = (event: Event) => process.listeners(event as "SIGTERM");

const until = async (condition: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("timed out waiting for the shutdown to finish");
};

describe("registerGracefulShutdown", () => {
    const stashed = EVENTS.map((event) => [event, listenersOf(event)] as const);
    const calls: string[] = [];
    const step = (name: string, run: () => Promise<void> = async () => undefined) => ({
        name,
        run: async () => {
            calls.push(`${name} starts`);
            await run();
            calls.push(`${name} ends`);
        },
    });

    beforeEach(() => {
        calls.length = 0;
        // Jest listens to uncaughtException itself, which would turn the emitted event into a failed test.
        for (const event of EVENTS) process.removeAllListeners(event);
        jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
            calls.push(`exit ${code}`);
        }) as never);
    });

    afterEach(() => {
        for (const event of EVENTS) process.removeAllListeners(event);
        for (const [event, listeners] of stashed) {
            for (const listener of listeners) process.on(event as "SIGTERM", listener as () => void);
        }
        jest.restoreAllMocks();
    });

    it("runs the steps one after the other, in the given order, and exits with 0", async () => {
        registerGracefulShutdown([
            step("first", () => new Promise((resolve) => setTimeout(resolve, 30))),
            step("second"),
            step("third"),
        ]);

        process.emit("SIGTERM", "SIGTERM");
        await until(() => calls.includes("exit 0"));

        expect(calls).toEqual([
            "first starts",
            "first ends",
            "second starts",
            "second ends",
            "third starts",
            "third ends",
            "exit 0",
        ]);
    });

    it("handles SIGINT in the same way", async () => {
        registerGracefulShutdown([step("only")]);
        process.emit("SIGINT", "SIGINT");
        await until(() => calls.includes("exit 0"));
        expect(calls).toEqual(["only starts", "only ends", "exit 0"]);
    });

    it("exits with 1 when a step fails, and does not run the steps after it", async () => {
        registerGracefulShutdown([
            step("first"),
            step("broken", async () => {
                throw new Error("cannot close");
            }),
            step("never"),
        ]);

        process.emit("SIGTERM", "SIGTERM");
        await until(() => calls.some((call) => call.startsWith("exit")));

        expect(calls).toEqual(["first starts", "first ends", "broken starts", "exit 1"]);
    });

    it("ignores a second signal while it is already shutting down", async () => {
        registerGracefulShutdown([step("slow", () => new Promise((resolve) => setTimeout(resolve, 50)))]);

        process.emit("SIGTERM", "SIGTERM");
        process.emit("SIGINT", "SIGINT");
        await until(() => calls.includes("exit 0"));

        expect(calls.filter((call) => call === "slow starts")).toHaveLength(1);
        expect(calls.filter((call) => call.startsWith("exit"))).toHaveLength(1);
    });

    it("shuts down and exits with 1 on an uncaught exception", async () => {
        registerGracefulShutdown([step("only")]);
        process.emit("uncaughtException", new Error("boom"));
        await until(() => calls.some((call) => call.startsWith("exit")));
        expect(calls).toEqual(["only starts", "only ends", "exit 1"]);
    });

    it("shuts down and exits with 1 on an unhandled rejection", async () => {
        registerGracefulShutdown([step("only")]);
        process.emit("unhandledRejection", new Error("boom"), Promise.resolve());
        await until(() => calls.some((call) => call.startsWith("exit")));
        expect(calls).toEqual(["only starts", "only ends", "exit 1"]);
    });

    it("forces the exit when a step never finishes", async () => {
        registerGracefulShutdown([step("stuck", () => new Promise<void>(() => undefined))], 50);

        process.emit("SIGTERM", "SIGTERM");
        await until(() => calls.some((call) => call.startsWith("exit")));

        expect(calls).toEqual(["stuck starts", "exit 1"]);
    });

    it("cancels the force-exit timer after a clean shutdown", async () => {
        const setTimer = jest.spyOn(globalThis, "setTimeout");
        const clearTimer = jest.spyOn(globalThis, "clearTimeout");
        registerGracefulShutdown([step("only")]);

        process.emit("SIGTERM", "SIGTERM");
        await until(() => calls.includes("exit 0"));

        const index = setTimer.mock.calls.findIndex(([, delay]) => delay === 10_000);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(clearTimer).toHaveBeenCalledWith(setTimer.mock.results[index]?.value);
    });
});
