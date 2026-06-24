// src/database/migrate.js
// ─────────────────────────────────────────────────────────
//  Runs SQL migration files in order on startup.
//
//  Why not an ORM migration tool (Sequelize, Knex)?
//  Writing raw SQL gives you complete control and makes the
//  schema visible and version-controlled without framework
//  magic. Every schema change is a numbered SQL file, readable
//  by any DBA, not wrapped in JavaScript chains.
//
//  The migrations table tracks which files have already run —
//  so this is idempotent. Run it on every startup safely.
// ─────────────────────────────────────────────────────────

'use strict';

const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate() {
  const client = await pool.connect();

  try {
    // Ensure the migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         SERIAL PRIMARY KEY,
        filename   VARCHAR(255) UNIQUE NOT NULL,
        run_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Get all .sql files sorted numerically (001_, 002_, ...)
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Skip already-run migrations
      const { rowCount } = await client.query(
        'SELECT 1 FROM _migrations WHERE filename = $1',
        [file]
      );
      if (rowCount > 0) {
        logger.debug(`[migrate] Skipping ${file} (already applied)`);
        continue;
      }

      logger.info(`[migrate] Applying ${file}...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

      // Run each migration in its own transaction
      // If it fails, the transaction rolls back and the error propagates
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO _migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        logger.info(`[migrate] ✓ Applied ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ err }, `[migrate] ✗ Failed to apply ${file}`);
        throw err;
      }
    }

    logger.info('[migrate] All migrations complete');
  } finally {
    client.release();
  }
}

// Allow running directly: node src/database/migrate.js
if (require.main === module) {
  const { pool } = require('../config/database');
  migrate()
    .then(() => pool.end())
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = migrate;