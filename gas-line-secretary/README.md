# GAS LINE Secretary

ระบบบอท LINE สำหรับประกาศให้ครูรับทราบ โดยใช้ Google Apps Script และ Google Sheet

## Project IDs

ระบบตั้งค่าเริ่มต้นไว้กับไฟล์ของคุณแล้ว:

```text
Folder ID: 1jrGC9ih_lwxvcRClTaO9rTR9D06znGX8
Sheet ID: 1vIMQysUl5qYeSjKjpPEv_VGiTsLrashPK7O27J-9D40
Script ID: 12dCy1-vQpUOkNyGTtwlhKwO0pz7K73DcBA70zxgGf3DMzu11AH35WhQr
```

## คำสั่งใน LINE

คำสั่งบริการตัวเองที่พิมพ์ได้เลย ไม่ต้องเรียกบอท:

```text
ช่วยเหลือ
help
ไอดี
id
ลงทะเบียน ครูชื่อ นามสกุล
สมัคร ครูชื่อ นามสกุล
ลงทะเบียน ผอ.ชื่อ นามสกุล
```

คำสั่งประกาศต้องขึ้นต้นด้วย:

```text
@เลขา
/เลขา
@ด่วน
/ด่วน
```

กติกา:

- `@เลขา` หรือ `/เลขา` = ประกาศปกติ ต้องรับทราบภายใน 3 ชม.
- `@ด่วน` หรือ `/ด่วน` = ประกาศด่วน ต้องรับทราบภายใน 1 ชม.
- `ช่วยเหลือ` หรือ `help` = แสดงวิธีใช้
- `ไอดี` หรือ `id` = แสดง userId, groupId, roomId ที่บอทเห็น
- `ลงทะเบียน ครูชื่อ นามสกุล` = บันทึกชื่อครูลงชีต `Teachers` อัตโนมัติ
- ถ้า userId อยู่ใน `ADMIN_USER_IDS` ระบบจะบันทึก `role` เป็น `director` อัตโนมัติ
- ข้อความอื่นในกลุ่ม = บอทไม่ตอบ
- เมื่อผู้มีสิทธิ์สั่งประกาศ ระบบจะส่งประกาศทันที ไม่มีปุ่มยืนยัน
- ครูกด `รับทราบ` แล้วระบบบันทึกชื่อและเวลา

## โครงสร้าง Google Sheet

ระบบจะสร้างชีตอัตโนมัติใน Sheet ID ที่ตั้งไว้ เมื่อ webhook หรือ trigger ทำงาน

ถ้าต้องการเตรียมชีตล่วงหน้า ให้เปิด Apps Script แล้วรัน `setupSheets()` หนึ่งครั้ง ระบบจะสร้างชีต:

- `Teachers`
- `Announcements`
- `Acknowledgements`
- `Settings`

ใน `Teachers` ให้ใส่ข้อมูลครู เช่น:

```text
teacherId | displayName | lineUserId | role | active
T001      | ครูสมชาย     | Uxxxxxxxxx | teacher | TRUE
```

ครูสามารถสร้างหรืออัปเดตข้อมูลแถวนี้เองได้ด้วยคำสั่ง:

```text
ลงทะเบียน ครูสมชาย ใจดี
```

หรือ:

```text
สมัคร ครูสมชาย ใจดี
```

ผอ. ก็ควรลงทะเบียนด้วย เพื่อให้ระบบแสดงชื่อถูกต้องเมื่อกดรับทราบ:

```text
ลงทะเบียน ผอ.สมชาย ใจดี
```

ถ้า userId ของ ผอ. อยู่ใน `ADMIN_USER_IDS` ระบบจะตั้ง `role` เป็น `director` และจะไม่ถูกนับเป็นครูที่ค้างรับทราบในสรุป deadline

## Script Properties

ใน Apps Script ไปที่ Project Settings > Script properties แล้วเพิ่ม:

```text
LINE_CHANNEL_ACCESS_TOKEN = token จาก LINE Developers
ADMIN_USER_IDS = LINE userId ของ ผอ. คั่นหลายคนด้วย comma
SPREADSHEET_ID = 1vIMQysUl5qYeSjKjpPEv_VGiTsLrashPK7O27J-9D40
```

## Deploy เป็น Web App

1. กด Deploy > New deployment
2. เลือก Type เป็น Web app
3. Execute as: Me
4. Who has access: Anyone
5. Copy Web app URL
6. นำ URL ไปใส่ใน LINE Developers > Messaging API > Webhook URL

## Trigger เช็ก deadline

หลัง deploy และตั้งค่าชีตแล้ว ให้รัน `installDeadlineTrigger()` หนึ่งครั้ง

ระบบจะเช็กทุก 10 นาที และสรุปคนที่ยังไม่รับทราบเมื่อครบกำหนด

## GitHub และ clasp

ติดตั้ง dependencies:

```powershell
npm.cmd install -g @google/clasp
```

Login กับ Google Apps Script:

```powershell
clasp.cmd login
```

ถ้ามี Apps Script project แล้ว ให้สร้างไฟล์ `.clasp.json`:

```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "./src"
}
```

หรือคัดลอกจาก `.clasp.example.json` แล้วเปลี่ยน `YOUR_SCRIPT_ID` เป็น Script ID จริง

ส่งโค้ดขึ้น GAS:

```powershell
clasp.cmd push
```

ดึงโค้ดจาก GAS:

```powershell
clasp.cmd pull
```
