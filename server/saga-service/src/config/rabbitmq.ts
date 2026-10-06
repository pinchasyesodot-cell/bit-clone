import amqp from "amqplib";
import { config } from "../config/env.js";
import type { SagaCommand } from "../interfaces/SagaType.js";
import { logger } from "../utils/logger.js";

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

    public consumeMessages = async (queueName: string, callback: (msg: SagaCommand) => void): Promise<void> => {
        const connection = await this.connect();
        if (!connection) {
            throw new Error("RabbitMQ connection is not established.");
        }
        if (!this.channel) {
            this.channel = await connection.createChannel();
        }
        const channel = this.channel;
        await channel.assertQueue(queueName, { durable: true });
        await channel.consume(queueName, (msg) => {
            if (msg !== null) {
                try {
                    const sagaCommand: SagaCommand = JSON.parse(msg.content.toString());
                    callback(sagaCommand);
                    channel.ack(msg);
                } catch (error) {
                    logger.error(`Error processing message: ${error}`);
                    channel.nack(msg, false, true);
                }
            }
        });
    };
}

export const rabbitMQConfig = new RabbitMQConfig();
