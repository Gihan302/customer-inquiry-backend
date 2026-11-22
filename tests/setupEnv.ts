// Runs before every test file, BEFORE any application code is imported.
// Forcing NODE_ENV=test makes the database pool connect to TEST_DB_NAME,
// even if the shell happens to have NODE_ENV=development set.
process.env.NODE_ENV = 'test';
