const pool = require('../database/connect');

const logAction = async (userId, action, targetResource, status) => {
  try {
    await pool.query(
      `INSERT INTO logs (user_id, action, target_resource, status) VALUES ($1, $2, $3, $4)`,
      [userId || null, action, targetResource, status]
    );
  } catch (err) {
    console.error('Logging Error:', err);
  }
};

module.exports = { logAction };