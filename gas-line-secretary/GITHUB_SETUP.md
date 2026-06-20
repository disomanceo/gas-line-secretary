# GitHub Setup

โฟลเดอร์นี้ตั้ง Git local ไว้สำหรับเชื่อม GitHub

Apps Script project ตั้งไว้ที่:

```text
Script ID: 12dCy1-vQpUOkNyGTtwlhKwO0pz7K73DcBA70zxgGf3DMzu11AH35WhQr
```

## 1. สร้าง repository บน GitHub

สร้าง repo ใหม่ เช่น:

```text
gas-line-secretary
```

แล้วคัดลอก HTTPS URL:

```text
https://github.com/YOUR_USERNAME/gas-line-secretary.git
```

## 2. เชื่อม remote

```powershell
git remote add origin https://github.com/YOUR_USERNAME/gas-line-secretary.git
git push -u origin main
```

ถ้ามี remote อยู่แล้ว:

```powershell
git remote set-url origin https://github.com/YOUR_USERNAME/gas-line-secretary.git
git push -u origin main
```

## 3. Workflow หลังจากนี้

แก้โค้ดในเครื่อง:

```powershell
git add .
git commit -m "Update LINE secretary bot"
git push
```

ส่งโค้ดขึ้น Google Apps Script:

```powershell
clasp.cmd push
```
