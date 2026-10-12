const pool = require('../database/connect');
const { logAction } = require('../security/logger');

// แสดงรายการแจ้งซ่อมทั้งหมด (กรองตามสิทธิ์ Role และดึงไฟล์รูปภาพแนบ)
exports.getRepairTickets = async (req, res) => {
  try {
    let query = `
      SELECT repair_tickets.*, users.username, files.stored_name AS file_name 
      FROM repair_tickets 
      JOIN users ON repair_tickets.user_id = users.id
      LEFT JOIN files ON repair_tickets.id = files.ticket_id
    `;
    let params = [];

    // ถ้าเป็น User ธรรมดา ให้ดูได้เฉพาะของตัวเอง
    // ส่วน Admin และ Manager จะเห็นรายการทั้งหมดในระบบ
    if (req.session.user.role_name === 'User') {
      query += ` WHERE repair_tickets.user_id = $1`;
      params.push(req.session.user.id);
    }

    query += ` ORDER BY repair_tickets.created_at DESC`;
    const result = await pool.query(query, params);

    res.render('dashboard', { 
      user: req.session.user, 
      tickets: result.rows 
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Database Error');
  }
};

// บันทึกข้อมูลใบแจ้งซ่อมใหม่ พร้อมรูปภาพ (ถ้ามี)
exports.createTicket = async (req, res) => {
  try {
    const userRole = req.session.user && req.session.user.role_name ? req.session.user.role_name.toLowerCase() : '';
    
    // 📌 ป้องกัน: อนุญาตให้เฉพาะ 'User' และ 'Admin' เท่านั้นที่สร้างใบแจ้งซ่อมได้
    if (userRole !== 'user' && userRole !== 'admin') {
      return res.status(403).send('Access Denied: บทบาทของคุณไม่มีสิทธิ์สร้างใบแจ้งซ่อม');
    }

    const { title, description } = req.body;
    const userId = req.session.user.id;
    const ip = req.ip;

    const ticketResult = await pool.query(
      `INSERT INTO repair_tickets (user_id, title, description, status) 
       VALUES ($1, $2, $3, 'รอดำเนินการ') RETURNING id`,
      [userId, title, description]
    );

    const ticketId = ticketResult.rows[0].id;

    // ถ้ามีการอัปโหลดไฟล์รูปภาพ
    if (req.file) {
      await pool.query(
        `INSERT INTO files (ticket_id, original_name, stored_name, file_type, file_size, uploaded_by) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ticketId, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, userId]
      );
    }

    // บันทึก Log การกระทำ
    await logAction(userId, 'CREATE_TICKET', `Ticket ID: ${ticketId}`, 'SUCCESS');

    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating ticket');
  }
};