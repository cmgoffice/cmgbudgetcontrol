# Migration Script: เพิ่มข้อมูล Vendor ลงใน PO และ Payment

## วัตถุประสงค์
สคริปต์นี้จะอัปเดตข้อมูล PO และ Payment ที่มีอยู่แล้วในระบบ โดยเพิ่มข้อมูล Vendor (ชื่อ, รหัส, ประเภท) ลงไปในแต่ละ document เพื่อให้ Role ที่ไม่มีสิทธิ์เข้าถึง Vendor Management สามารถเห็นชื่อ Vendor ได้

## สิ่งที่สคริปต์จะทำ

### 1. อัปเดต PO Documents
- เพิ่ม fields: `vendorName`, `vendorCode`, `vendorType`
- อัปเดตเฉพาะ PO ที่มี `vendorId` แต่ยังไม่มี `vendorName`
- ข้าม PO ที่มีข้อมูล Vendor อยู่แล้ว

### 2. อัปเดต Payment Documents
- เพิ่ม fields: `contractorName`, `contractorCode`, `contractorType`
- อัปเดตเฉพาะ Payment ที่มี `contractorId` แต่ยังไม่มี `contractorName`
- ข้าม Payment ที่มีข้อมูล Vendor อยู่แล้ว

## วิธีใช้งาน

### ขั้นตอนที่ 1: ตรวจสอบ Dependencies
ตรวจสอบว่าได้ติดตั้ง Firebase SDK แล้ว:
```bash
npm list firebase
```

ถ้ายังไม่มี ให้ติดตั้ง:
```bash
npm install firebase
```

### ขั้นตอนที่ 2: ตรวจสอบไฟล์ .env
ตรวจสอบว่าไฟล์ `.env` มีการตั้งค่า Firebase ครบถ้วน:
```env
REACT_APP_API_KEY=...
REACT_APP_AUTH_DOMAIN=...
REACT_APP_PROJECT_ID=...
REACT_APP_STORAGE_BUCKET=...
REACT_APP_MESSAGING_SENDER_ID=...
REACT_APP_APP_ID=...
```

### ขั้นตอนที่ 3: รันสคริปต์
```bash
node migrate_vendor_data.mjs
```

### ขั้นตอนที่ 4: ตรวจสอบผลลัพธ์
สคริปต์จะแสดงผลลัพธ์ดังนี้:
```
🚀 เริ่มต้น Migration: เพิ่มข้อมูล Vendor ลงใน PO และ Payment

📦 กำลังโหลดข้อมูล Vendors...
✅ โหลด Vendors สำเร็จ: 50 รายการ

📝 กำลังอัปเดต POs...
✅ PO PO26J01-CR0001: เพิ่มข้อมูล Vendor "บริษัท ABC จำกัด"
✅ PO PO26J01-SP0002: เพิ่มข้อมูล Vendor "ห้างหุ้นส่วน XYZ"
...

📊 สรุปการอัปเดต POs:
   - อัปเดตสำเร็จ: 45 รายการ
   - มีข้อมูลอยู่แล้ว: 5 รายการ
   - ไม่มี Vendor: 2 รายการ

💰 กำลังอัปเดต Payments...
✅ Payment PO26J01-SP0002-001: เพิ่มข้อมูล Vendor "ห้างหุ้นส่วน XYZ"
...

📊 สรุปการอัปเดต Payments:
   - อัปเดตสำเร็จ: 30 รายการ
   - มีข้อมูลอยู่แล้ว: 3 รายการ
   - ไม่มี Vendor: 1 รายการ

🎉 Migration เสร็จสมบูรณ์!

📈 สรุปรวม:
   - PO ที่อัปเดต: 45 รายการ
   - Payment ที่อัปเดต: 30 รายการ
   - รวมทั้งหมด: 75 รายการ
```

## ความปลอดภัย

### สคริปต์นี้ปลอดภัย เพราะ:
1. ✅ **ไม่ลบข้อมูล** - เพิ่มข้อมูลเท่านั้น ไม่ลบหรือแก้ไขข้อมูลเดิม
2. ✅ **ข้ามข้อมูลที่มีอยู่แล้ว** - ไม่เขียนทับข้อมูล Vendor ที่มีอยู่แล้ว
3. ✅ **รันได้หลายครั้ง** - สามารถรันซ้ำได้โดยไม่เกิดปัญหา (Idempotent)
4. ✅ **แสดงผลลัพธ์ชัดเจน** - แสดงรายละเอียดทุกขั้นตอน

### ข้อควรระวัง:
- ⚠️ ต้องมีสิทธิ์ในการเขียนข้อมูลใน Firestore
- ⚠️ ควรสำรองข้อมูลก่อนรัน (แนะนำ แต่ไม่จำเป็น)
- ⚠️ ถ้ามีข้อมูลจำนวนมาก อาจใช้เวลานาน

## การทดสอบ

### ทดสอบก่อนรันจริง (Dry Run)
ถ้าต้องการดูว่าจะอัปเดตอะไรบ้างโดยไม่เขียนข้อมูลจริง สามารถแก้ไขสคริปต์:

1. เปิดไฟล์ `migrate_vendor_data.mjs`
2. Comment บรรทัด `await updateDoc(...)` ออก
3. เพิ่ม `console.log('DRY RUN: จะอัปเดต...')` แทน
4. รันสคริปต์เพื่อดูผลลัพธ์

## การแก้ไขปัญหา

### ปัญหา: "Cannot find module 'firebase'"
**วิธีแก้:** ติดตั้ง Firebase SDK
```bash
npm install firebase
```

### ปัญหา: "Permission denied"
**วิธีแก้:** ตรวจสอบ Firestore Rules ว่าอนุญาตให้เขียนข้อมูลได้

### ปัญหา: "Cannot read .env file"
**วิธีแก้:** ตรวจสอบว่าไฟล์ `.env` อยู่ใน root directory และมีข้อมูลครบถ้วน

### ปัญหา: "Vendor not found"
**ความหมาย:** PO/Payment อ้างอิง Vendor ID ที่ไม่มีในระบบ
**วิธีแก้:** ตรวจสอบว่า Vendor ถูกลบไปหรือไม่ หรือ ID ไม่ถูกต้อง

## หลังจากรัน Migration

### ตรวจสอบผลลัพธ์:
1. เข้าสู่ระบบด้วย Role ที่ไม่มีสิทธิ์เข้าถึง Vendor Management
2. เปิดหน้า Payment Subcontractor
3. ตรวจสอบว่าเห็นชื่อผู้รับเหมาช่วงแล้ว

### ถ้าพบปัญหา:
- ตรวจสอบ Console Log ของสคริปต์
- ตรวจสอบข้อมูลใน Firestore Console
- รันสคริปต์อีกครั้ง (ปลอดภัย)

## ข้อมูลเพิ่มเติม

### Fields ที่เพิ่มใน PO:
```javascript
{
  vendorId: "vendor123",        // มีอยู่แล้ว
  vendorName: "บริษัท ABC จำกัด", // เพิ่มใหม่
  vendorCode: "V001",            // เพิ่มใหม่
  vendorType: "Supplier",        // เพิ่มใหม่
}
```

### Fields ที่เพิ่มใน Payment:
```javascript
{
  contractorId: "vendor123",           // มีอยู่แล้ว
  contractorName: "บริษัท ABC จำกัด",   // เพิ่มใหม่
  contractorCode: "V001",               // เพิ่มใหม่
  contractorType: "Supplier",           // เพิ่มใหม่
}
```

## สรุป
สคริปต์นี้จะช่วยให้ PO และ Payment ที่มีอยู่แล้วในระบบสามารถแสดงชื่อ Vendor ได้โดยไม่ต้องเปิด PO ใหม่ ทำให้ Role ทุกตำแหน่งสามารถเห็นข้อมูล Vendor ได้อย่างสมบูรณ์
