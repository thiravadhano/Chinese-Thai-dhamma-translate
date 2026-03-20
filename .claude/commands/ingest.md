นำเข้าข้อความจาก CBETA API เข้าสู่ฐานข้อมูล dhamma-translator

## วิธีใช้
```
/ingest T1609
/ingest T1609 2        # ระบุ juan
/ingest T0374 juan=3   # รูปแบบอื่น
```

## ขั้นตอน

1. อ่าน argument จาก `$ARGUMENTS` — รูปแบบ: `<CBETA_ID> [juan]`
   - CBETA_ID เช่น T1609, T0374, X0073
   - juan เป็นตัวเลข (default = 1)

2. ตรวจสอบว่า dev server กำลังทำงานอยู่:
   ```bash
   curl -s http://localhost:4321/api/status
   ```
   ถ้าไม่ตอบสนอง ให้แจ้งผู้ใช้ว่า "กรุณา run `npm run dev` ก่อน"

3. POST ไปที่ `/api/ingest`:
   ```bash
   curl -s -X POST http://localhost:4321/api/ingest \
     -H "Origin: http://localhost:4321" \
     -F "mode=cbeta" \
     -F "cbeta_id=<CBETA_ID>" \
     -F "juan=<juan>"
   ```

4. แสดงผลลัพธ์:
   - สำเร็จ: แสดงชื่อคัมภีร์ จำนวน segments และ URL `/texts/<id>`
   - ล้มเหลว: แสดง error message

## ตัวอย่างผลลัพธ์

```
✓ นำเข้าสำเร็จ
  ชื่อ:     大乘成業論
  CBETA ID: T1609 · juan 1
  Segments: 230 รายการ
  เปิดดู:   http://localhost:4321/texts/1
```
