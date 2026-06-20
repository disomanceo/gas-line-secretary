# GitHub Setup

## สร้าง repository บน GitHub

สร้าง repository ใหม่ชื่อเช่น `smart-line-ok` แล้วคัดลอก HTTPS remote URL เช่น:

```text
https://github.com/YOUR_USERNAME/smart-line-ok.git
```

## เชื่อมโปรเจกต์นี้กับ GitHub

เมื่อโฟลเดอร์ `.git` ใช้งานได้แล้ว ให้รัน:

```powershell
git init -b main
git add .
git commit -m "Initial LINE auto-reply webhook"
git remote add origin https://github.com/YOUR_USERNAME/smart-line-ok.git
git push -u origin main
```

ถ้าเคยตั้ง remote แล้ว ให้เปลี่ยน URL ด้วย:

```powershell
git remote set-url origin https://github.com/YOUR_USERNAME/smart-line-ok.git
```

## GitHub Secrets สำหรับ LINE

ใน GitHub ไปที่ repository > Settings > Secrets and variables > Actions แล้วเพิ่ม:

```text
LINE_CHANNEL_ACCESS_TOKEN
LINE_CHANNEL_SECRET
```

อย่า commit ไฟล์ `.env` ขึ้น GitHub เพราะมี token จริงอยู่ข้างใน

## เชื่อม LINE Webhook

หลัง deploy ระบบแล้ว ให้เอา public URL ไปใส่ใน LINE Developers:

```text
https://YOUR_DEPLOYED_DOMAIN/webhook
```

จากนั้นเปิด:

```text
Use webhook: Enabled
```

แล้วกด Verify

## หมายเหตุเรื่องโฟลเดอร์นี้

ตอนนี้เครื่องนี้มีโฟลเดอร์ `.git` ที่ถูก Windows permission ปิดการเขียนไว้ ทำให้ `git init` ยังไม่สำเร็จ ถ้าต้องการใช้โฟลเดอร์เดิม ให้ลบหรือปลดล็อกสิทธิ์ของ `.git` ก่อน แล้วค่อยรันคำสั่งด้านบน
