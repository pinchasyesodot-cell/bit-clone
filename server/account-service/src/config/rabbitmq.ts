import amqp from "amqplib";
import { config } from "../config/env.js";
import type { SagaCommand, SagaResponse } from "../interfaces/saga.type.js";
import { logger } from "../utils/logger.js";

type CommandHandler = (msg: SagaCommand) => Promise<void>;

class RabbitMQConfig {
    public publishTimeoutMs = 5000;
    public drainTimeoutMs = 5000;
    private connecting: Promise<amqp.ChannelModel> | null = null;
    private connection: amqp.ChannelModel | null = null;
    private publishChannel: Promise<amqp.ConfirmChannel> | null = null;
    private consumeChannel: amqp.Channel | null = null;
    private consumerTags: string[] = [];
    private publishedQueues = new Set<string>();
    private inFlight = new Set<Promise<void>>();
    private closing = false;

    private connect = async (): Promise<amqp.ChannelModel> => {
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
        connection.on("error", (error: unknown) => logger.error(`RabbitMQ connection error: ${error}`));
        connection.on("close", () => this.exitIfUnexpected("connection"));
        return connection;
    };

    private exitIfUnexpected = (what: string): void => {
        if (this.closing) return;
        logger.error(`RabbitMQ ${what} closed unexpectedly, exiting so the service is restarted`);
        process.exit(1);
    };

    private getPublishChannel = async (): Promise<amqp.ConfirmChannel> => {
        this.publishChannel ??= this.connect()
            .then(async (connection) => {
                const channel = await connection.createConfirmChannel();
                channel.on("error", (error: unknown) => logger.error(`RabbitMQ publish channel error: ${error}`));
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

    private getConsumeChannel = async (): Promise<amqp.Channel> => {
        if (this.consumeChannel) return this.consumeChannel;
        const connection = await this.connect();
        const channel = await connection.createChannel();
        channel.on("error", (error: unknown) => logger.error(`RabbitMQ consume channel error: ${error}`));
        channel.on("close", () => this.exitIfUnexpected("consume channel"));
        this.consumeChannel = channel;
        return channel;
    };

    private sendAndWaitForConfirm = async (
        channel: amqp.ConfirmChannel,
        queueName: string,
        content: Buffer
    ): Promise<void> => {
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`RabbitMQ did not confirm the message to ${queueName} in time.`));
            }, this.publishTimeoutMs);
            channel.sendToQueue(queueName, content, { persistent: true }, (error: unknown) => {
                clearTimeout(timer);
                if (error) {
                    reject(error instanceof Error ? error : new Error(String(error)));
                } else {
                    resolve();
                }
            });
        });
    };

    public publishMessage = async (queueName: string, message: SagaResponse): Promise<void> => {
        const channel = await this.getPublishChannel();
        if (!this.publishedQueues.has(queueName)) {
            await channel.assertQueue(queueName, { durable: true });
            this.publishedQueues.add(queueName);
        }
        await this.sendAndWaitForConfirm(channel, queueName, Buffer.from(JSON.stringify(message)));
    };

    private handleMessage = async (
        channel: amqp.Channel,
        msg: amqp.ConsumeMessage,
        callback: CommandHandler
    ): Promise<void> => {
        try {
            const command: SagaCommand = JSON.parse(msg.content.toString());
            await callback(command);
            channel.ack(msg);
        } catch (error) {
            logger.error("Failed to process message", {
                queue: msg.fields.routingKey,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
            });
            const requeue = !(error instanceof SyntaxError) && !msg.fields.redelivered;
            try {
                channel.nack(msg, false, requeue);
            } catch (nackError) {
                logger.error(`Error sending nack for message: ${nackError}`);
            }
        }
    };

    public consumeMessages = async (queueName: string, callback: CommandHandler): Promise<void> => {
        const channel = await this.getConsumeChannel();
        await channel.assertQueue(queueName, { durable: true });
        await channel.prefetch(1);
        const { consumerTag } = await channel.consume(queueName, async (msg) => {
            if (msg === null) return;
            const work = this.handleMessage(channel, msg, callback);
            this.inFlight.add(work);
            try {
                await work;
            } finally {
                this.inFlight.delete(work);
            }
        });
        this.consumerTags.push(consumerTag);
        logger.info("Consuming messages", { queue: queueName });
    };

    public close = async (): Promise<void> => {
        this.closing = true;
        try {
            if (this.consumeChannel) {
                for (const consumerTag of this.consumerTags) {
                    await this.consumeChannel.cancel(consumerTag);
                }
            }
            await Promise.race([
                Promise.allSettled([...this.inFlight]),
                new Promise<void>((resolve) => setTimeout(resolve, this.drainTimeoutMs).unref()),
            ]);
            await this.consumeChannel?.close();
            const publishChannel = await this.publishChannel?.catch(() => null);
            await publishChannel?.close();
            await this.connection?.close();
        } catch (error) {
            logger.warn(`Error while closing RabbitMQ connection: ${error}`);
        } finally {
            this.connecting = null;
            this.connection = null;
            this.publishChannel = null;
            this.consumeChannel = null;
            this.consumerTags = [];
            this.publishedQueues.clear();
            this.inFlight.clear();
        }
    };
}

export const rabbitMQConfig = new RabbitMQConfig();
