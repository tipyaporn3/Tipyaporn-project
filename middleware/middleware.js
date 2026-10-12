const pool = require('../database/connect');
const { logAction } = require('../security/logger');
const crypto = require('node:crypto');

// 1. ตรวจสอบว่าผู้ใช้เข้าสู่ระบบหรือยัง
function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

// 2. ตรวจสอบสิทธิ์ Admin (สำหรับป้องกันส่วน Admin Panel)
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  
  const isAdmin = req.session.userId === Number(process.env.ADMIN_USER_ID) || req.session.role === 'Admin';
  if (!isAdmin) {
    logAction(req, 'ACCESS_DENIED', 'Admin Panel', 'FORBIDDEN');
    return res.status(403).send('<h1>403 Forbidden</h1><p>Administrator only - คุณไม่มีสิทธิ์เข้าถึงส่วนนี้</p>');
  }
  next();
}

// 3. ตรวจสอบสิทธิ์ ACL จากฐานข้อมูล PostgreSQL ตาม Resource และ Permission
function checkPermission(requiredResource, requiredPermission) {
  return async (req, res, next) => {
    if (!req.session || !req.session.userId) {
      return res.redirect('/login');
    }

    const userId = req.session.userId;
    const isAdmin = userId === Number(process.env.ADMIN_USER_ID);

    if (isAdmin) {
      return next();
    }

    try {
      const result = await pool.query(
        `SELECT 1 FROM acl a 
         JOIN resources r USING (resource_id)
         JOIN permissions p USING (permission_id)
         WHERE a.user_id = $1 AND r.resource_name = $2 AND p.permission_name = $3`,
        [userId, requiredResource, requiredPermission]
      );

      if (result.rowCount > 0) {
        return next();
      }

      await logAction(req, 'ACCESS_DENIED', `${requiredResource}:${requiredPermission}`, 'FORBIDDEN');
      return res.status(403).send(`<h1>403 Forbidden</h1><p>คุณไม่มีสิทธิ์ในการกระทำ (${requiredPermission}) บนทรัพยากรนี้</p>`);

    } catch (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }
  };
}

// 4. ระบบป้องกัน CSRF Token สำหรับฟอร์ม POST
function csrf(req, res, next) {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrf = req.session.csrf;
  
  if (req.method === 'POST' && req.body._csrf !== req.session.csrf) {
    return res.status(403).send('Invalid form token; reload the page');
  }
  next();
}

// 5. ตรวจสอบความถูกต้องของ ID
function validId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= 2147483647;
}

// 6. ฟังก์ชันช่วยจัดรูปแบบข้อความ
function text(value) {
  return String(value || '').trim();
}

module.exports = {
  requireLogin,
  requireAdmin,
  checkPermission,
  csrf,
  validId,
  text
};