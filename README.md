# 🛠️ Repair Management System (ระบบแจ้งซ่อม)

ระบบแจ้งซ่อมพร้อมระบบควบคุมสิทธิ์ผู้ใช้งานแบบไดนามิก (Dynamic Role and Permission Management / ACL) พัฒนาด้วย Node.js, Express และ PostgreSQL

---

## 📌 คุณสมบัติเด่นของระบบ (Features)
- 🔐 **Authentication & Session:** ระบบเข้าสู่ระบบ/ออกจากระบบ จัดการ Session ปลอดภัย
- 👥 **Dynamic RBAC / ACL Management:**
  - เพิ่มบทบาท (Role) ใหม่เข้าสู่ฐานข้อมูลผ่านหน้าเว็บได้แบบไดนามิก โดยไม่ต้อง Restart Server
  - จัดการและสลับเปลี่ยน Role ของผู้ใช้งานได้ทันที
  - กำหนดสิทธิ์การเข้าถึงหน้า Dashboard และ API ตามระดับ Role
- 📝 **Repair Ticket Management:** 
  - สร้างใบแจ้งซ่อม พร้อมระบบอัปโหลดรูปภาพประกอบ
  - อัปเดตสถานะการแจ้งซ่อม (สำหรับ Admin, Manager, Staff)
  - ระบบลบรายการแจ้งซ่อม พร้อมลบไฟล์รูปภาพออกจาก Server และตาราง `files` อัตโนมัติ (เฉพาะ Admin หรือเจ้าของรายการ)
- 📜 **Audit Logging System:** บันทึก Log การทำงานของผู้ใช้งานและผู้ดูแลระบบแบบครอบคลุม (ADD_USER, DELETE_USER, UPDATE_USER_ROLE, ADD_ROLE, DELETE_TICKET, ฯลฯ)
- 🛡️ **Access Control Enforcement:** แสดงหน้า **403 Forbidden** เมื่อผู้ใช้พยายามเข้าถึงหน้าหรือ API ที่ไม่มีสิทธิ์

---

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)
- **Backend Framework:** Node.js, Express.js
- **Database:** PostgreSQL
- **Template Engine:** EJS
- **Authentication & Security:** `bcrypt`, `express-session`
- **File Upload:** `multer`
- **File System Handling:** `fs`, `path`

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)
repair-system/
├── controllers/          # ตัวจัดการ Logic หลักของระบบ (authController, repairController)
├── database/             # ไฟล์เชื่อมต่อฐานข้อมูล PostgreSQL (connect.js)
├── public/               # Static Files (CSS, JS) และโฟลเดอร์เก็บรูป uploads/
├── security/             # Middleware ตรวจสอบสิทธิ์ (auth.js) และตัวบันทึก Log (logger.js)
├── views/                # หน้าจอการทำงาน (EJS Templates)
│   ├── admin-panel/      # หน้าจอสำหรับ Admin (manage-acl, view-logs, manager-logs)
│   └── ...
├── .env.example          # ตัวอย่างไฟล์การตั้งค่า Environment Variables (ไม่มีรหัสผ่านจริง)
├── database.sql          # สคริปต์ SQL สำหรับสร้างตารางและลงข้อมูลตัวอย่าง
├── server.js             # ไฟล์หลักควบคุม Express Server และ Route สิทธิ์
└── package.json          # รายการ Dependencies ของโปรเจกต์

---

## 🚀 วิธีการติดตั้งและเริ่มใช้งาน (Setup & Installation)

### 1. การเตรียมฐานข้อมูล (Database Setup)
1. เปิด PostgreSQL (ผ่าน `psql` หรือ pgAdmin)
2. สร้างฐานข้อมูลใหม่ชื่อ `repair_system`:
   ```sql
   CREATE DATABASE repair_system;

กำหนดค่าการเชื่อมต่อฐานข้อมูลในไฟล์ .env ตามเครื่องของคุณ:
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_NAME=repair_system
SESSION_SECRET=pastel-repair-secret

# ติดตั้ง Packages ที่จำเป็น
npm install
หรือ npm install express express-session pg bcrypt multer dotenv ejs

# เริ่มต้นทำงานเซิร์ฟเวอร์
node server.js

## 🔑 บัญชีผู้ใช้สำหรับทดสอบระบบ (Test Accounts)
| Role | Username | Password | คำอธิบายสิทธิ์ |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `Admin1!` | เข้าหน้า Admin Panel, จัดการ ACL/เพิ่ม Role, ลบข้อมูล |
| **Manager** | `manager` | `Manager1!` | ดู Manager Logs และอัปเดตสถานะ |
| **Staff** | `staff` | `Staff1!` | อัปเดตสถานะใบแจ้งซ่อม |
| **User** | `user1` | `Student1!` | สร้างใบแจ้งซ่อม และลบรายการของตนเอง |