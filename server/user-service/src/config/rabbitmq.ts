import amqp from "amqplib";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { errorMessage } from "../utils/errorMessage.js";
import type { UserCreatedEvent } from "../interfaces/userType.js";

class RabbitMQConfig {
    public publishTimeoutMs = 5000;
    private connecting: Promise<amqp.ChannelModel> | null = null;
    private connection: amqp.ChannelModel | null = null;
    private publishChannel: Promise<amqp.ConfirmChannel> | null = null;
    private publishedQueues = new Set<string>();
    private closing = false;

    public connect = async (): Promise<amqp.ChannelModel> => {
        this.connecting ??= this.openConnection().catch((error: unknown) => {
            this.connecting = null;
            throw error;
        });
        return this.connecting;
    };

    private openConnection = async (): Promise<amqp.ChannelModel> => {
        const connection = await amqp.connect(config.RABBITMQ_URI);
        this.closing = false;
        this.connection = connection;
        logger.info("Connected to RabbitMQ successfully");
        connection.on("error", (error: unknown) =>
            logger.error("RabbitMQ connection error", { error: errorMessage(error) })
        );
        connection.on("close", () => this.exitIfUnexpected());
        return connection;
    };

    private exitIfUnexpected = (): void => {
        if (this.closing) return;
        logger.error("RabbitMQ connection closed unexpectedly, exiting so the service is restarted");
        process.exit(1);
    };

    private getPublishChannel = async (): Promise<amqp.ConfirmChannel> => {
        this.publishChannel ??= this.connect()
            .then(async (connection) => {
                const channel = await connection.createConfirmChannel();
                channel.on("error", (error: unknown) =>
                    logger.error("RabbitMQ publish channel error", { error: errorMessage(error) })
                );
                channel.on("close", () => {
                    this.publishChannel = null;
                    this.publishedQueues.clear();
                });
                return channel;
            })
            .catch((error: unknown) => {
                this.publishChannel = null;
                throw error;
            });
        return this.publishChannel;
    };

    private sendAndWaitForConfirm = async (
        channel: amqp.ConfirmChannel,
        queueName: string,
        content: Buffer,
        options: amqp.Options.Publish = {}
    ): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`RabbitMQ did not confirm the message to ${queueName} in time.`));
            }, this.publishTimeoutMs);
            channel.sendToQueue(queueName, content, { ...options, persistent: true }, (error: unknown) => {
                clearTimeout(timer);
                if (error) {
                    reject(error instanceof Error ? error : new Error(errorMessage(error)));
                } else {
                    resolve();
                }
            });
        });
    };

    private ensureQueue = async (channel: amqp.ConfirmChannel, queueName: string): Promise<void> => {
        if (this.publishedQueues.has(queueName)) return;
        await channel.assertQueue(queueName, { durable: true });
        this.publishedQueues.add(queueName);
    };

    public publishMessage = async (queueName: string, message: UserCreatedEvent): Promise<void> => {
        const channel = await this.getPublishChannel();
        await this.ensureQueue(channel, queueName);
        await this.sendAndWaitForConfirm(channel, queueName, Buffer.from(JSON.stringify(message)));
    };

    public close = async (): Promise<void> => {
        this.closing = true;
        try {
            const publishChannel = await this.publishChannel?.catch(() => null);
            await publishChannel?.close();
            await this.connection?.close();
        } catch (error) {
            logger.warn("Error while closing RabbitMQ connection", { error: errorMessage(error) });
        } finally {
            this.connecting = null;
            this.connection = null;
            this.publishChannel = null;
            this.publishedQueues.clear();
        }
    };
}

export const rabbitMQConfig = new RabbitMQConfig();
