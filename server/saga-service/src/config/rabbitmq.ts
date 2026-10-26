import amqp from "amqplib";
import { config } from "../config/env.js";
import type { SagaCommand, SagaResponse } from "../interfaces/SagaType.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/AppError.js";

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
            throw new AppError("RabbitMQ connection is not established.", 500);
        }
        if (!this.channel) {
            this.channel = await connection.createChannel();
        }
        const channel = this.channel;
        await channel.assertQueue(queueName, { durable: true });
        const result = channel.sendToQueue(queueName, Buffer.from(JSON.stringify(message)), { persistent: true });
        return result;
    };

    public consumeMessages = async (
        queueName: string,
        callback: (msg: SagaResponse) => Promise<void>
    ): Promise<void> => {
        const connection = await this.connect();
        if (!connection) {
            throw new AppError("RabbitMQ connection is not established.", 500);
        }
        if (!this.channel) {
            this.channel = await connection.createChannel();
        }
        const channel = this.channel;
        await channel.assertQueue(queueName, { durable: true });
        await channel.prefetch(1);
        await channel.consume(queueName, async (msg) => {
            if (msg === null) return;
            try {
                const response: SagaResponse = JSON.parse(msg.content.toString());
                await callback(response);
                channel.ack(msg);
            } catch (error) {
                logger.error(`Error processing message: ${error}`);
                const requeue = !(error instanceof SyntaxError) && !msg.fields.redelivered;
                channel.nack(msg, false, requeue);
            }
        });
    };
}

export const rabbitMQConfig = new RabbitMQConfig();
