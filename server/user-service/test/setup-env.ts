// Runs before every test file, so the tests never depend on a real .env file
// (and never use real secrets). dotenv does not override variables that already exist.
process.env.NODE_ENV = "test";
process.env.PORT = "4001";
// Never connected to: user.test.ts starts its own MongoDB in memory. env.ts only needs a value.
process.env.MONGO_URI = "mongodb://localhost:27017/unused";
process.env.JWT_SECRET = "test-secret";
process.env.URL_CLIENT = "http://localhost:3000";
process.env.RABBITMQ_URI = "amqp://localhost";
