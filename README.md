# Smart LINE OK

ระบบ LINE auto-reply webhook แบบ Node.js ล้วน ไม่ต้องติดตั้ง package เพิ่ม

## ตั้งค่า

1. คัดลอก `.env.example` เป็น `.env`
2. ใส่ค่าจาก LINE Developers:
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
3. รันระบบ:

```powershell
npm.cmd run dev
```

หรือ:

```powershell
node src/server.js
```

## URL สำหรับ LINE Webhook

เมื่อนำขึ้น deploy แล้ว ให้ตั้งค่า Webhook URL ใน LINE Developers เป็น:

```text
https://your-domain.example/webhook
```

สำหรับทดสอบในเครื่อง สามารถใช้ tunnel เช่น ngrok แล้วชี้มาที่ port `3000`

## Health Check

```text
GET /health
```

ถ้าระบบพร้อม จะตอบ:

```json
{"ok":true}
```

## การตอบกลับเริ่มต้น

ระบบจะตอบกลับข้อความตาม keyword พื้นฐาน:

- `สวัสดี`, `hello`, `hi`
- `เวลา`
- `ช่วยเหลือ`, `help`

แก้ logic ได้ใน `src/line.js`
