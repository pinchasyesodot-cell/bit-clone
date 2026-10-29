import { jest } from "@jest/globals";
import request from "supertest";
import server from "../src/app.js";
import database from "../src/config/db.js";

describe("Health Check Endpoint", () => {
    afterAll(async () => {
        if (database.isConnected()) {
            await database.disconnect();
        }
    });

    it("should return 200 OK when DB is connected", async () => {
        jest.spyOn(database, "isConnected").mockReturnValue(true);
        const response = await request(server.app).get("/health");
        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: "OK",
            db: "Connected",
        });
    });

    it("should return 503 Service Unavailable when DB is disconnected", async () => {
        jest.spyOn(database, "isConnected").mockReturnValue(false);
        const response = await request(server.app).get("/health");
        expect(response.status).toBe(503);
        expect(response.body).toEqual({
            status: "Error",
            db: "Not connected",
        });
    });
});
