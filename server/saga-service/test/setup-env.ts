// Runs before every test file, so the tests never depend on a real .env file
// (and never use real secrets). dotenv does not override variables that already exist.
process.env.NODE_ENV = "test";
process.env.PORT = "4005";
process.env.MONGO_URI = "mongodb://localhost:27017/saga-test";
process.env.RABBITMQ_URI = "amqp://localhost";
process.env.URL_ACCOUNTS = "http://localhost:4010/api/accounts";
process.env.JWT_SECRET = "test-secret";
process.env.URL_CLIENT = "http://localhost:3000";
