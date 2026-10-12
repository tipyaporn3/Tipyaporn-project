const pool = require('./connect'); // ปรับ path ตามไฟล์ connect.js 
const bcrypt = require('bcryptjs');

async function main() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. ตรวจสอบว่าตาราง users ว่างอยู่หรือไม่ (ป้องกันการรันซ้ำแล้วข้อมูลซ้อน)
        const count = await client.query('SELECT COUNT(*) FROM users');
        if (Number(count.rows[0].count) !== 0) {
            throw new Error('ตาราง users มีข้อมูลอยู่แล้ว ไม่สามารถรัน seed ซ้ำได้ (กรุณาเคลียร์ข้อมูลก่อน)');
        }

        // 2. เพิ่มข้อมูล Roles (4 บทบาท)
        await client.query(`
            INSERT INTO roles (id, name, description) VALUES 
            (1, 'Admin', 'ผู้ดูแลระบบสูงสุด จัดการทุกฟังก์ชันและ ACL'),
            (2, 'Manager', 'ผู้จัดการแผนก ตรวจสอบภาพรวมและอนุมัติ'),
            (3, 'Staff', 'ช่างซ่อม/เจ้าหน้าที่ รับเรื่องและอัปเดตสถานะงานซ่อม'),
            (4, 'User', 'ผู้ใช้งานทั่วไป แจ้งซ่อมและดูประวัติของตนเอง')
            ON CONFLICT (id) DO NOTHING;
        `);

        // 3. เพิ่มข้อมูลผู้ใช้ทั้ง 4 บทบาท พร้อมแฮชรหัสผ่านด้วย bcryptjs
        await client.query(
            `INSERT INTO users (username, password_hash, role_id) VALUES ($1, $2, $3)`,
            ['admin', await bcrypt.hash('Admin1!', 10), 1]
        );
        await client.query(
            `INSERT INTO users (username, password_hash, role_id) VALUES ($1, $2, $3)`,
            ['manager', await bcrypt.hash('Manager1!', 10), 2]
        );
        await client.query(
            `INSERT INTO users (username, password_hash, role_id) VALUES ($1, $2, $3)`,
            ['staff', await bcrypt.hash('Staff1!', 10), 3]
        );
        await client.query(
            `INSERT INTO users (username, password_hash, role_id) VALUES ($1, $2, $3)`,
            ['user', await bcrypt.hash('Student1!', 10), 4]
        );

        // 4. เพิ่มข้อมูลใบแจ้งซ่อมตัวอย่าง (เชื่อมกับ user_C ไอดี 4)
        await client.query(`
            INSERT INTO repair_tickets (user_id, title, description, status) 
            VALUES 
            (4, 'คอมพิวเตอร์ห้อง Lab เปิดไม่ติด', 'หน้าจอดำสนิท ไม่มีสัญญาณไฟเข้า ตรวจสอบเบื้องต้นแล้วปลั๊กหลวมหรือไม่', 'รอดำเนินการ'),
            (4, 'โปรเจคเตอร์ห้องประชุม 3 ภาพไม่ขึ้น', 'ต่อสาย HDMI แล้วขึ้น No Signal น่าจะเป็นที่ตัวพอร์ตเครื่องฉาย', 'กำลังดำเนินการ')
            ON CONFLICT DO NOTHING;
        `);

        await client.query('COMMIT');
        console.log('✅ Seed Database สำหรับระบบแจ้งซ่อมสำเร็จเรียบร้อย!');
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ เกิดข้อผิดพลาดในการรัน Seeder:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();