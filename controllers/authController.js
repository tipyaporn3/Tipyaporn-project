const pool = require('../database/connect');
const bcrypt = require('bcrypt');
const { logAction } = require('../security/logger');

// แสดงหน้าฟอร์มเข้าสู่ระบบ
exports.getLogin = (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', { error: null });
};

// ตรวจสอบข้อมูลการเข้าสู่ระบบ
exports.postLogin = async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT users.*, roles.name as role_name 
       FROM users 
       JOIN roles ON users.role_id = roles.id 
       WHERE users.username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      await logAction(null, 'LOGIN_FAILED', `Username: ${username}`, 'FAILURE');
      return res.render('login', { error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      await logAction(user.id, 'LOGIN_FAILED', `Password mismatch`, 'FAILURE');
      return res.render('login', { error: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
    }

    // เก็บข้อมูลลง Session
    req.session.user = {
      id: user.id,
      username: user.username,
      role_name: user.role_name
    };

    await logAction(user.id, 'LOGIN_SUCCESS', `User logged in`, 'SUCCESS');
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).render('login', { error: 'เกิดข้อผิดพลาดในระบบฐานข้อมูล' });
  }
};

// ออกจากระบบ
exports.logout = async (req, res) => {
  if (req.session && req.session.user) {
    await logAction(req.session.user.id, 'LOGOUT', `User logged out`, 'SUCCESS');
  }
  req.session.destroy(() => {
    res.redirect('/login');
  });
};