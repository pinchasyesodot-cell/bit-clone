// Runs before every test file, so the tests never depend on a real .env file
// (and never use real secrets). dotenv does not override variables that already exist.
process.env.NODE_ENV = "test";
process.env.PORT = "4001";
// The user suite refuses to run unless the database name ends with -test.
process.env.MONGO_URI = "mongodb://localhost:27017/user-service-test";
process.env.JWT_SECRET = "test-secret";
process.env.URL_CLIENT = "http://localhost:3000";
