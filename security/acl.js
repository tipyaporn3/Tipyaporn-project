const pool = require('../database/connect');
const { logAction } = require('./logger');

const checkPermission = (requiredPermission) => {
  return async (req, res, next) => {
    if (!req.session || !req.session.user) {
      await logAction(req, 'ACCESS_DENIED', requiredPermission, 'UNAUTHORIZED');
      return res.redirect('/login');
    }

    const roleId = req.session.user.role_id;

    try {
      const result = await pool.query(
        `SELECT p.name FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         WHERE rp.role_id = $1 AND p.name = $2`,
        [roleId, requiredPermission]
      );

      // ถ้าเป็น Admin ให้ผ่านได้ทุกกรณี หรือมี Permission ตรงกัน
      const isAdmin = req.session.user.role === 'Admin';
      if (isAdmin || result.rows.length > 0) {
        return next();
      }

      await logAction(req, 'ACCESS_DENIED', requiredPermission, 'FORBIDDEN');
      return res.status(403).send('<h1>403 Forbidden</h1><p>คุณไม่มีสิทธิ์เข้าถึงหน้านี้หรือใช้งานฟังก์ชันนี้</p>');
      
    } catch (err) {
      console.error(err);
      return res.status(500).send('Internal Server Error');
    }
  };
};

module.exports = { checkPermission };