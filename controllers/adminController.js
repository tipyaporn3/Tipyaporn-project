const pool = require('../database/connect');
const { logAction } = require('../security/logger');

// แสดงหน้าจัดการผู้ใช้ทั้งหมด
exports.getManageUsers = async (req, res) => {
  try {
    const usersResult = await pool.query(
      `SELECT users.id, users.username, roles.name as role_name 
       FROM users JOIN roles ON users.role_id = roles.id ORDER BY users.id ASC`
    );
    const rolesResult = await pool.query(`SELECT * FROM roles ORDER BY id ASC`);

    res.render('admin-panel/manage-users', {
      user: req.session.user,
      users: usersResult.rows,
      roles: rolesResult.rows,
      error: null,
      success: null
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
};

// เปลี่ยนแปลง Role ของผู้ใช้ (จัดการสิทธิ์)
exports.updateUserRole = async (req, res) => {
  const { userId, roleId } = req.body;
  const adminId = req.session.user.id;

  try {
    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [roleId, userId]);
    await logAction(adminId, 'UPDATE_USER_ROLE', `Target User ID: ${userId} to Role ID: ${roleId}`, 'SUCCESS');
    
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating role');
  }
};

// แสดงหน้าดูประวัติ Activity Logs
exports.getViewLogs = async (req, res) => {
  try {
    const logsResult = await pool.query(
      `SELECT logs.*, users.username 
       FROM logs 
       LEFT JOIN users ON logs.user_id = users.id 
       ORDER BY logs.timestamp DESC LIMIT 50`
    );

    res.render('admin-panel/view-logs', {
      user: req.session.user,
      logs: logsResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading logs');
  }
};