import amqp from "amqplib";
import { config } from "../config/env.js";
import type { Saga, SagaCommand } from "../interfaces/SagaType.js";

class RabbitMQConfig {
    private connection: amqp.ChannelModel | null;
    private channel: amqp.Channel | null;
    constructor() {
        this.connection = null;
        this.channel = null;
    }

    private connect = async (): Promise<amqp.ChannelModel | null> => {
        if (!this.connection) {
            this.connection = await amqp.connect(config.RABBITMQ_URI || "amqp://localhost");
        }
        return this.connection;
    };

    public publishMessage = async (queueName: string, message: SagaCommand): Promise<boolean> => {
        const connection = await this.connect();
        if (!connection) {
            throw new Error("RabbitMQ connection is not established.");
        }
        if (!this.channel) {
            this.channel = await connection.createChannel();
        }
        const channel = this.channel;
        await channel.assertQueue(queueName, { durable: true });
        const result = channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), { persistent: true });
        return result;
    };
}

export const rabbitMQConfig = new RabbitMQConfig();
