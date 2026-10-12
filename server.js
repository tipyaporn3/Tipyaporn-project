const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcrypt');
const fs = require('fs'); // 📌 เพิ่มโมดูล fs สำหรับจัดการลบไฟล์จริงออกจาก Server
require('dotenv').config();

const pool = require('./database/connect');
const authController = require('./controllers/authController');
const repairController = require('./controllers/repairController');
const { isAuthenticated } = require('./security/auth');
const { logAction } = require('./security/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// ตั้งค่า View Engine เป็น EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware พื้นฐาน
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ตั้งค่า Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'pastel-repair-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

// ตั้งค่าการอัปโหลดไฟล์ (Multer) สำหรับรูปแจ้งซ่อม
const uploadDir = path.join(__dirname, 'public/uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const allowedImageMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (allowedImageMimeTypes.includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only image files are allowed.'));
  }
});

const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).render('dashboard', { 
        error: 'ไฟล์มีขนาดเกิน 2MB', 
        user: req.session.user,
        tickets: [] 
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).render('dashboard', { 
        error: 'อนุญาตเฉพาะไฟล์รูปภาพเท่านั้น', 
        user: req.session.user,
        tickets: []
      });
    }
  }
  if (err) {
    return res.status(500).render('dashboard', { 
      error: 'Upload failed', 
      user: req.session.user,
      tickets: []
    });
  }
  next();
};

// ==========================================
// 1. PUBLIC & AUTH ROUTES
// ==========================================
app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', authController.getLogin);
app.post('/login', authController.postLogin);
app.get('/logout', authController.postLogout || authController.logout);


// ==========================================
// 2. DASHBOARD & REPAIR ROUTES (ปรับให้ยืดหยุ่นรองรับ Role ใหม่)
// ==========================================

const checkRoleDashboard = (req, res, next) => {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  const role = req.session.user.role_name ? req.session.user.role_name.toLowerCase() : '';
  
  if (role === 'admin') {
    return res.redirect('/admin/dashboard');
  } else if (role === 'manager') {
    return res.redirect('/manager/dashboard');
  } else if (role === 'staff') {
    return res.redirect('/staff/dashboard');
  } else {
    // 📌 Role ใหม่ที่เพิ่มเข้ามาผ่านเว็บ (เช่น technician) จะถูกส่งมาที่หน้า user/dashboard โดยอัตโนมัติ ไม่ติด 403
    return res.redirect('/user/dashboard');
  }
};

app.get('/dashboard', isAuthenticated, checkRoleDashboard);

app.get('/admin/dashboard', isAuthenticated, (req, res, next) => {
  const role = req.session.user.role_name ? req.session.user.role_name.toLowerCase() : '';
  if (role !== 'admin') return res.status(403).send('<h1>403 Forbidden</h1>');
  next();
}, repairController.getRepairTickets);

app.get('/manager/dashboard', isAuthenticated, (req, res, next) => {
  const role = req.session.user.role_name ? req.session.user.role_name.toLowerCase() : '';
  if (role !== 'manager' && role !== 'admin') return res.status(403).send('<h1>403 Forbidden</h1>');
  next();
}, repairController.getRepairTickets);

app.get('/staff/dashboard', isAuthenticated, (req, res, next) => {
  const role = req.session.user.role_name ? req.session.user.role_name.toLowerCase() : '';
  if (role !== 'staff' && role !== 'admin') return res.status(403).send('<h1>403 Forbidden</h1>');
  next();
}, repairController.getRepairTickets);

// 📌 ปรับปรุงเงื่อนไขหน้า /user/dashboard ให้เปิดกว้างสำหรับ Role ทั่วไปและ Role ใหม่ที่สร้างขึ้น
app.get('/user/dashboard', isAuthenticated, (req, res, next) => {
  const role = req.session.user.role_name ? req.session.user.role_name.toLowerCase() : '';
  if (role === 'admin') {
    return res.redirect('/admin/dashboard');
  }
  next();
}, repairController.getRepairTickets);

app.post('/repair/create', isAuthenticated, (req, res, next) => {
  upload.single('image')(req, res, (err) => handleUploadError(err, req, res, next));
}, repairController.createTicket);

app.post('/repair/delete/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.session.user ? req.session.user.id : null;
    const userRole = req.session.user && req.session.user.role_name ? req.session.user.role_name.toLowerCase() : '';

    const ticketResult = await pool.query('SELECT user_id FROM repair_tickets WHERE id = $1', [id]);

    if (ticketResult.rows.length === 0) {
      return res.status(404).send('ไม่พบรายการที่ต้องการลบ');
    }

    const ticket = ticketResult.rows[0];
    const isAdminUser = (userRole === 'admin');
    const isOwner = (Number(ticket.user_id) === Number(userId));

    if (!isAdminUser && !isOwner) {
      return res.status(403).send('<h1>403 Forbidden</h1><p>คุณมีสิทธิ์ลบได้เฉพาะรายการของตนเองเท่านั้น</p>');
    }

    const fileResult = await pool.query('SELECT stored_name FROM files WHERE ticket_id = $1', [id]);

    if (fileResult.rows.length > 0) {
      const fileRecord = fileResult.rows[0];
      
      if (fileRecord.stored_name) {
        const filePath = path.join(__dirname, 'public/uploads', fileRecord.stored_name);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }

      await pool.query('DELETE FROM files WHERE ticket_id = $1', [id]);
    }

    await pool.query('DELETE FROM repair_tickets WHERE id = $1', [id]);

    if (typeof logAction === 'function') {
      await logAction(userId, 'DELETE_TICKET', `Deleted repair ticket ID: ${id} and associated files`, 'SUCCESS');
    }

    if (userRole === 'admin') res.redirect('/admin/dashboard');
    else if (userRole === 'manager') res.redirect('/manager/dashboard');
    else res.redirect('/user/dashboard');
  } catch (err) {
    console.error('Error deleting ticket and file:', err);
    res.status(500).send('Internal Server Error');
  }
});


// ==========================================
// 3. ADMIN PANEL ROUTES (ACL & LOGS)
// ==========================================

const requireAdminCheck = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role_name === 'Admin') {
    return next();
  }
  res.status(403).send('<h1>403 Forbidden</h1><p>คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะ Admin เท่านั้น)</p>');
};

app.get('/admin/acl', isAuthenticated, requireAdminCheck, async (req, res) => {
  try {
    const usersResult = await pool.query(`
      SELECT u.id, u.username, u.role_id, r.name as role_name, u.created_at 
      FROM users u 
      JOIN roles r ON u.role_id = r.id 
      ORDER BY u.id ASC
    `);

    const rolesResult = await pool.query('SELECT * FROM roles ORDER BY id ASC');

    res.render('admin-panel/manage-acl', {
      users: usersResult.rows,
      roles: rolesResult.rows,
      user: req.session.user
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});

// 📌 Route เพิ่ม Role ใหม่ผ่านเว็บ (แบบระบุ ID อัตโนมัติป้องกัน Error)
app.post('/admin/acl/add-role', isAuthenticated, requireAdminCheck, async (req, res) => {
  try {
    const { role_name } = req.body;
    const adminId = req.session.user ? req.session.user.id : null;

    if (!role_name || role_name.trim() === '') {
      return res.status(400).send('กรุณาระบุชื่อบทบาท (Role) ที่ต้องการเพิ่ม');
    }

    const idResult = await pool.query('SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM roles');
    const nextId = idResult.rows[0].next_id;

    await pool.query(`INSERT INTO roles (id, name) VALUES ($1, $2)`, [nextId, role_name.trim()]);

    if (typeof logAction === 'function') {
      await logAction(adminId, 'ADD_ROLE', `Added new role: ${role_name}`, 'SUCCESS');
    }

    res.redirect('/admin/acl');
  } catch (err) {
    console.error('Error adding role:', err);
    res.status(500).send('Internal Server Error (Role name may already exist)');
  }
});

app.post('/admin/acl/add-user', isAuthenticated, requireAdminCheck, async (req, res) => {
  try {
    const { username, password, role_id } = req.body;
    const adminId = req.session.user ? req.session.user.id : null;
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (username, password_hash, role_id) VALUES ($1, $2, $3)`,
      [username, hashedPassword, role_id]
    );

    if (typeof logAction === 'function') {
      await logAction(adminId, 'ADD_USER', `Added new user: ${username} with role_id: ${role_id}`, 'SUCCESS');
    }

    res.redirect('/admin/acl');
  } catch (err) {
    console.error('Error adding user:', err);
    res.status(500).send('Internal Server Error (Username may already exist)');
  }
});

app.post('/admin/acl/update-role/:id', isAuthenticated, requireAdminCheck, async (req, res) => {
  try {
    const { id } = req.params;
    const { role_id } = req.body;
    const adminId = req.session.user ? req.session.user.id : null;

    await pool.query(`UPDATE users SET role_id = $1 WHERE id = $2`, [role_id, id]);

    if (typeof logAction === 'function') {
      await logAction(adminId, 'UPDATE_USER_ROLE', `Updated user ID ${id} to role_id: ${role_id}`, 'SUCCESS');
    }

    res.redirect('/admin/acl');
  } catch (err) {
    console.error('Error updating user role:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/admin/acl/delete-user/:id', isAuthenticated, requireAdminCheck, async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.session.user ? req.session.user.id : null;

    if (Number(id) === Number(adminId)) {
      return res.status(400).send('ไม่สามารถลบบัญชีของตนเองได้ขณะเข้าใช้งาน');
    }

    await pool.query(`DELETE FROM users WHERE id = $1`, [id]);

    if (typeof logAction === 'function') {
      await logAction(adminId, 'DELETE_USER', `Deleted user ID: ${id}`, 'SUCCESS');
    }

    res.redirect('/admin/acl');
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/admin/logs', isAuthenticated, requireAdminCheck, async (req, res) => {
  try {
    const { action, username } = req.query;

    let actionsQuery = 'SELECT DISTINCT action FROM logs ORDER BY action ASC';
    const actionsResult = await pool.query(actionsQuery);

    let query = `
      SELECT l.id, l.action, l.target_resource, l.status, l.timestamp, u.username 
      FROM logs l 
      LEFT JOIN users u ON l.user_id = u.id 
      WHERE 1=1
    `;
    let queryParams = [];
    let paramIndex = 1;

    if (action && action.trim() !== '') {
      query += ` AND l.action = $${paramIndex++}`;
      queryParams.push(action);
    }

    if (username && username.trim() !== '') {
      query += ` AND u.username ILIKE $${paramIndex++}`;
      queryParams.push(`%${username}%`);
    }

    query += ` ORDER BY l.timestamp DESC LIMIT 50`;
    const logsResult = await pool.query(query, queryParams);

    res.render('admin-panel/view-logs', {
      logs: logsResult.rows,
      actions: actionsResult.rows,
      user: req.session.user,
      filterAction: action || '',
      filterUsername: username || ''
    });
  } catch (err) {
    console.error('Error fetching admin logs:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/manager/logs', isAuthenticated, async (req, res, next) => {
  const role = req.session.user && req.session.user.role_name ? req.session.user.role_name.toLowerCase() : '';
  if (role !== 'manager' && role !== 'admin') {
    return res.status(403).send('<h1>403 Forbidden</h1><p>คุณไม่มีสิทธิ์เข้าถึงหน้านี้</p>');
  }
  next();
}, async (req, res) => {
  try {
    const { action, username } = req.query;

    let actionsQuery = `
      SELECT DISTINCT action FROM logs 
      WHERE action NOT IN ('ADD_USER', 'DELETE_USER', 'UPDATE_USER_ROLE', 'ADD_ROLE') 
      ORDER BY action ASC
    `;
    const actionsResult = await pool.query(actionsQuery);

    let query = `
      SELECT l.id, l.action, l.target_resource, l.status, l.timestamp, u.username 
      FROM logs l 
      LEFT JOIN users u ON l.user_id = u.id 
      WHERE l.action NOT IN ('ADD_USER', 'DELETE_USER', 'UPDATE_USER_ROLE', 'ADD_ROLE')
    `;
    let queryParams = [];
    let paramIndex = 1;

    if (action && action.trim() !== '') {
      query += ` AND l.action = $${paramIndex++}`;
      queryParams.push(action);
    }

    if (username && username.trim() !== '') {
      query += ` AND u.username ILIKE $${paramIndex++}`;
      queryParams.push(`%${username}%`);
    }

    query += ` ORDER BY l.timestamp DESC LIMIT 50`;
    const logsResult = await pool.query(query, queryParams);

    res.render('admin-panel/manager-logs', {
      logs: logsResult.rows,
      actions: actionsResult.rows,
      user: req.session.user,
      filterAction: action || '',
      filterUsername: username || ''
    });
  } catch (err) {
    console.error('Error fetching manager logs:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/repair/update-status/:id', isAuthenticated, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.session.user ? req.session.user.id : null;
    const userRole = req.session.user && req.session.user.role_name ? req.session.user.role_name.toLowerCase() : '';

    const allowedRoles = ['admin', 'manager', 'staff'];
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).send('Access Denied: คุณไม่มีสิทธิ์เปลี่ยนสถานะ');
    }

    await pool.query(`UPDATE repair_tickets SET status = $1 WHERE id = $2`, [status, id]);

    await logAction(userId, 'UPDATE_TICKET_STATUS', `Updated ticket ID ${id} to status: ${status}`, 'SUCCESS');

    if (userRole === 'admin') res.redirect('/admin/dashboard');
    else if (userRole === 'manager') res.redirect('/manager/dashboard');
    else if (userRole === 'staff') res.redirect('/staff/dashboard');
    else res.redirect('/user/dashboard');
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).send('Internal Server Error');
  }
});


// ==========================================
// 4. ERROR & SERVER START
// ==========================================
app.use((req, res) => {
  res.status(404).send('<h1>404 Page Not Found</h1>');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});