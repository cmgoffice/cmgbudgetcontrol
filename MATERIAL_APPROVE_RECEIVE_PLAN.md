# แผนเพิ่ม Material Approve และ Material Received

วันที่จัดทำ: **15 ตุลาคม 2569 (2026-10-15)**; ปรับปรุงล่าสุด: **16 ตุลาคม 2569 (2026-10-16), Asia/Bangkok**

สถานะล่าสุด: **พัฒนาและทดสอบในเครื่องแล้ว วันที่ 16 ตุลาคม 2569 — ยังไม่ได้ deploy หรือแก้ข้อมูล production**

รายละเอียดการพัฒนาและหลักฐานทดสอบอยู่ในหัวข้อ 10–12 ส่วนประวัติช่วงวางแผนเก็บไว้ตามวันที่เดิม

## 1. วัตถุประสงค์และขอบเขต

เพิ่มขั้นตอน Material Received เฉพาะ PO ที่อ้างอิง PR ซึ่งเช็ค Material Approve ให้ตรวจเอกสาร Certificate และบันทึกหมายเหตุก่อนเข้ารับของจริง โดยหลังผ่าน Material ผู้ใช้ต้องบันทึกจำนวนรับเองตามระบบเดิม

- PO ที่ไม่เข้าเงื่อนไขใช้โฟลว์เดิมทั้งหมด
- ไม่เปลี่ยนสูตร Budget, PR/PO Balance, ราคา, ส่วนลด, VAT, มัดจำ หรือยอดชำระ
- แก้ส่วน Invoice/Pay เฉพาะเงื่อนไขที่สร้าง Receive อัตโนมัติหรือกำหนดสถานะรับของของ PO กลุ่มนี้ ไม่ปรับกระบวนการคำนวณการเงิน
- ไม่แก้ข้อมูลย้อนหลังหรือเปลี่ยน Receive ที่บันทึกแล้วโดยอัตโนมัติ
- การแก้ไขโค้ดที่มีอยู่ใน working tree ก่อนจัดทำแผนนี้ ไม่ใช่ผลงานของฟังก์ชันนี้ และต้องรักษาไว้

## 2. ข้อกำหนดจากการปรับแผนล่าสุด

| ตัวเลือก | PO ที่มี Material Approve | PO ทั่วไป |
| --- | --- | --- |
| รับของปกติ / รับก่อนจ่าย | ต้องผ่าน Material Received ก่อนกรอกจำนวนรับจริง | ทำงานเดิม |
| จ่ายก่อนรับของ | เลือกได้; Invoice/Pay ไม่ถือว่าเป็นการผ่าน Material หรือรับสินค้า | ทำงานเดิม |
| Checkbox รับของแล้ว | ปิดใช้งานและแจ้งว่าต้องผ่าน Material แล้วบันทึกรับเอง | ทำงานเดิม |
| Receive Auto | ไม่อนุญาตสำหรับ PO กลุ่มนี้ รวมถึงค่าที่ระบบเลือกให้อัตโนมัติตามประเภท PO | ทำงานเดิม |

ต้องตรวจข้อกำหนดทั้งบนหน้าจอและจุดบันทึกจริง ไม่พึ่งการซ่อนหรือปิดปุ่มเพียงอย่างเดียว หลังผ่าน Material ก็ยังไม่เปิดทางให้ Auto Receive สร้างจำนวนรับแทนผู้ใช้

## 3. โฟลว์เป้าหมาย

### รับก่อนจ่าย / รับของปกติ

PR เช็ค Material Approve → PO อนุมัติครบ → Material Received → ยืนยันผ่าน → แท็บรับของ → กรอกจำนวนรับ → Invoice/จ่ายเงินตามระบบเดิม

### จ่ายก่อนรับของ

- PO อนุมัติครบแล้วแสดงใน Material Received ขณะยังไม่ผ่าน Material
- Invoice/Pay เดินต่อได้ตามเงื่อนไขเดิม การเปลี่ยนสถานะการเงินต้องไม่ทำให้รายการรอตรวจ Material หาย
- เมื่อผ่าน Material แล้ว ต้องถึงเงื่อนไขพร้อมรับของของโฟลว์เดิมด้วย จึงแสดงเป็นรายการให้รับในแท็บรับของ
- ถ้าผ่าน Material แต่ยังรอเงื่อนไขพร้อมรับ ให้ดูผลตรวจย้อนหลังและเหตุผลที่ยังรับไม่ได้ได้อย่างชัดเจน
- การผ่าน Material ไม่ปลดเงื่อนไขการจ่ายเงินเดิม และการจ่ายเงินไม่ปลดเงื่อนไข Material

## 4. ผลตรวจโค้ดปัจจุบัน

ตรวจจาก source code ใน workspace วันที่ 2026-10-15 ไม่ได้ทดสอบพฤติกรรมกับฐานข้อมูล production

1. `src/views/ReceiveView.tsx` มีแท็บ `material_received` อยู่แล้ว แต่ยังเป็นหน้าว่าง
2. Modal PO มี Checkbox “จ่ายก่อนรับของ” และ “รับของแล้ว”; เมื่อเลือกจ่ายก่อนรับ ระบบล็อก Receive Type เป็น `Pay before receive`
3. `src/lib/poDocumentFlow.ts` กำหนดสถานะหลังอนุมัติเป็น `Paid` เมื่อมี configured receive และเป็น `Received` เมื่อใช้ Receive Auto
4. `src/views/POView.tsx` และ `src/contexts/AppDataContext.tsx` มีเส้นทางสร้าง Receive อัตโนมัติเมื่ออนุมัติ PO รวมถึงกรณีตั้งค่า “รับของแล้ว” ครบ
5. `src/views/InvoiceView.tsx` มี `ensureConfiguredReceiveAfterPayment` ที่อาจสร้าง Receive ตอนบันทึก Invoice
6. `src/views/BillingPayView.tsx` มี `syncAutoReceivesForPay` ซึ่งสร้าง/ปรับ/ลบ Receive ที่เกี่ยวข้องกับ Pay
7. `isPoReadyForManualReceive` ใน `src/lib/constants.ts` รองรับ Approved/Approve/Partial Receive และ `paid` สำหรับจ่ายก่อนรับ แต่ไม่รองรับทุกสถานะทางการเงิน และกัน PO ประเภท SP/DC ออก
8. `src/views/ReceiveView.tsx` รวมจำนวนจาก collection `receives` และซ่อน PO ที่รับครบแล้ว การสร้าง Receive ในขั้น Material จะกระทบการคำนวณนี้

ข้อสรุป: ต้องเพิ่มเงื่อนไขเฉพาะ PO Material ทั้งการเลือกคิว การสร้าง Receive และการกำหนดสถานะรับของ ไม่ใช่เพิ่ม UI อย่างเดียว

## 5. แผนการพัฒนา

### ขั้นที่ 1 — ข้อมูล PR

- เพิ่ม Checkbox `Material Approve` ใน Create/Edit PR
- เมื่อเช็คแสดงช่อง `Material Approve No.`; แนวทางเริ่มต้นให้บังคับกรอกเมื่อต้องการบันทึก PR ที่เช็ค
- เสนอฟิลด์ `materialApprove: boolean` และ `materialApproveNo: string`
- รองรับการเปิดดู แก้ไข โหลด Draft และการสร้าง PR ผ่านเส้นทางที่เกี่ยวข้อง โดยไม่แก้ยอดรายการ
- เอกสารเดิมที่ไม่มีฟิลด์ให้ถือว่าไม่เช็ค

### ขั้นที่ 2 — ส่งต่อเงื่อนไขไป PO

- อ่าน PR ที่ PO อ้างอิงจริงและบันทึก snapshot ของเงื่อนไขและเลขอ้างอิงลง PO
- แนวทางเริ่มต้น: ถ้ามี PR ที่เช็คอย่างน้อยหนึ่งใบ ให้ PO ทั้งใบผ่าน Material และแสดงเลขอ้างอิงของ PR ที่เกี่ยวข้อง
- PR เดียวแยกหลาย PO ให้แต่ละ PO มีผลตรวจ Material ของตนเอง
- PO Draft ที่เปลี่ยน PR อ้างอิงต้องคำนวณเงื่อนไขใหม่ รวมถึงตรวจค่า Auto Receive/รับของแล้วที่เลือกไว้ก่อนหน้า และแจ้งผู้ใช้เมื่อจำเป็นต้องเปลี่ยนค่า
- เมื่อเปิด PO เข้าสู่กระบวนการอนุมัติแล้ว การแก้ PR ภายหลังต้องไม่เปลี่ยนเงื่อนไขของ PO เงียบ ๆ
- การแก้ PO ที่เปลี่ยน PR หรือรายการซึ่งเกี่ยวกับผลตรวจ ต้องไม่คงผลผ่านเก่าโดยไม่มีการตรวจสอบ; ห้ามล้างผลตรวจหรือย้อน Receive เดิมโดยอัตโนมัติ

### ขั้นที่ 3 — ข้อมูลและ Modal Material Received

- เสนอให้เก็บข้อมูลแยกใน PO เช่น `materialReceiveRequired`, `materialApproveRefs` และ `materialReceive`
- `materialReceive` เก็บสถานะรอตรวจ/ผ่านแล้ว, Certificate, หมายเหตุ, ผู้ยืนยัน และวันเวลาจากเซิร์ฟเวอร์
- สร้าง Modal แยก โดยใช้ส่วนแสดงรายละเอียด PO/สินค้าเดิมร่วมกันได้ แต่แยก state และคำสั่งบันทึก
- แสดง PO/PR/เลข Material Approve, รองรับ Certificate หลายไฟล์, หมายเหตุ และปุ่มยืนยันผ่าน
- ตรวจชนิด/ขนาดไฟล์และอัปโหลดสำเร็จก่อนยืนยัน; ถ้าล้มเหลวต้องไม่เปลี่ยนเป็นผ่าน
- บันทึกประวัติผู้ดำเนินการ และเปิดดูเอกสารย้อนหลังได้
- ขั้นนี้ไม่กรอกจำนวนรับจริง ไม่สร้างเอกสารใน `receives`, เลข RP, Invoice, vendor evaluation หรือรายการส่งเข้า CMG Store

### ขั้นที่ 4 — แยกคิวและป้องกันการข้าม

- Material Received ใช้เงื่อนไขเฉพาะ: PO อนุมัติครบ + ต้องตรวจ Material + ยังไม่ผ่าน โดยเคารพสถานะยกเลิก/ปิด/อยู่ระหว่างแก้ไข
- ไม่ใช้รายการพร้อมรับเดิมเป็นฐานทั้งหมด เพราะสถานะ Invoice/Pay อาจทำให้ Material หายจากคิว
- แท็บรับของใช้เงื่อนไขพร้อมรับเดิม เพิ่มว่าต้องไม่ต้องตรวจ Material หรือผ่าน Material แล้ว
- ไม่แสดง PO เดียวกันเป็นงานรอดำเนินการทั้งสองแท็บพร้อมกัน
- ตรวจข้อมูลล่าสุดและสิทธิ์ก่อนยืนยัน Material และก่อนสร้าง Receive; ป้องกันการเปิด Modal ค้าง การกดซ้ำ และผู้ใช้หลายคนบันทึกพร้อมกัน
- รวมเงื่อนไข Material ไว้ใน helper กลาง เพื่อลดความคลาดเคลื่อนระหว่างหน้าจอและเส้นทางบันทึก

### ขั้นที่ 5 — ปรับเฉพาะจุด Auto Receive และสถานะ

- ปิด “รับของแล้ว” และ Receive Auto สำหรับ PO Material พร้อมข้อความอธิบาย
- ตรวจและป้องกันที่ตัวสร้างข้อมูล Receive อัตโนมัติ รวมถึงผู้เรียกใน POView, AppDataContext, InvoiceView และ BillingPayView
- ห้ามตั้ง `Received`/สถานะจบการรับ เพียงเพราะมีค่า Auto Receive หรือ received-after-payment ค้างอยู่
- คงการสร้าง Invoice และการจ่ายเงินที่ได้รับอนุญาตตามโฟลว์เดิม
- ตรวจเส้นทางแก้ไข/ย้อน Pay ด้วย ไม่ให้เงื่อนไขใหม่ลบ Receive เดิมหรือสร้าง Receive ขึ้นใหม่ผิดกรณี
- หาก helper ไม่สร้าง Auto Receive เพราะเป็น PO Material ผู้เรียกต้องเดินต่อส่วนอนุมัติ/Invoice/Pay ได้ ไม่ตีความเป็นข้อผิดพลาดแล้วหยุดทั้งกระบวนการ
- ตรวจสิทธิ์ Firestore/Storage ที่จำเป็นกับฟิลด์และไฟล์ใหม่ รวมถึงการป้องกันการข้ามผ่านจุดเขียนข้อมูล โดยจำกัดการเปลี่ยนกฎเฉพาะส่วนนี้

## 6. ข้อกำหนดที่ใช้ในการพัฒนา

- Certificate แนบตามความจำเป็น ไม่บังคับ รองรับ PDF/PNG/JPG/WebP สูงสุด 20 MB ต่อไฟล์
- ไม่อนุญาตให้สร้าง PO SP/DC จาก PR Material Approve เพื่อคงโฟลว์ Payment Subcontractor เดิม
- PO Material ที่ส่งอนุมัติแล้วล็อก PR อ้างอิงและเลข Material ตาม snapshot; Draft ใหม่ที่ยังไม่ส่งอนุมัติเปลี่ยน PR อ้างอิงได้
- เมื่อผ่าน Material แล้ว ห้ามเปลี่ยนรายการสินค้า จำนวน หน่วย ผู้จำหน่าย ประเภท PO และ PR อ้างอิงผ่านฟอร์ม PO; การแก้ข้อมูลอื่นใช้เงื่อนไขเดิมและไม่ล้างผลตรวจหรือย้อน Receive
- PO เก่าที่รับแล้วหรือเปิดไปก่อนมีฟิลด์ใหม่: ไม่บังคับย้อนเข้า Material และไม่ย้ายข้อมูลย้อนหลังอัตโนมัติ

## 7. ไฟล์ที่คาดว่าจะเกี่ยวข้อง

| ไฟล์ | ขอบเขตที่วางแผน |
| --- | --- |
| `src/views/PRView.tsx` | Checkbox, No., การบันทึกและแสดงข้อมูล PR |
| `src/views/POView.tsx` | Snapshot PR, ปิดตัวเลือกที่ข้าม Material, ป้องกัน Auto Receive ตอนอนุมัติ |
| `src/views/ReceiveView.tsx` | แยกคิว Material/รับของ และตรวจเงื่อนไขก่อนรับจริง |
| Component Material Received ใหม่ | รายละเอียด, Certificate, หมายเหตุ, ยืนยันและดูย้อนหลัง |
| Helper Material ใหม่และ tests | เงื่อนไขร่วมของ Material และการเลือกคิว |
| `src/lib/poDocumentFlow.ts`, `src/lib/receiveAuto.ts` | ป้องกันสร้าง Auto Receive และกำหนดสถานะเฉพาะ PO Material |
| `src/contexts/AppDataContext.tsx` | รองรับเส้นทางอนุมัติส่วนกลาง |
| `src/views/InvoiceView.tsx`, `src/views/BillingPayView.tsx` | กัน Auto Receive โดยคงงานการเงินเดิม |
| `src/lib/constants.ts` | ตรวจผลร่วมกับสถานะพร้อมรับ; ปรับเฉพาะเมื่อจำเป็น |
| กฎสิทธิ์/ระบบบันทึก Log ที่เกี่ยวข้อง | รองรับฟิลด์/ไฟล์/ประวัติใหม่เท่าที่จำเป็น |

รายชื่อนี้เป็นขอบเขตคาดการณ์ ไม่ใช่รายชื่อไฟล์ที่แก้แล้ว

## 8. เกณฑ์ทดสอบก่อนใช้งาน

รายการนี้เป็น checklist สำหรับ UAT แบบคลิกครบโฟลว์ด้วยบัญชีจริง ซึ่งยังไม่ได้ดำเนินการ ส่วนผล automated tests และ emulator ที่ทำแล้วบันทึกในหัวข้อ 10

- [ ] PR ไม่เช็คและเอกสารเก่าทำงานเหมือนเดิม
- [ ] PR เช็คแสดง No. และบันทึก/เปิดกลับมาได้ถูกต้อง
- [ ] PO หลาย PR และ PR แยกหลาย PO ส่งต่อเงื่อนไขถูกต้อง
- [ ] การเปลี่ยน PR/ประเภท PO ไม่ทำให้ค่า Receive Auto หรือรับของแล้วหลุดผ่าน
- [ ] PO อนุมัติครบและยังไม่ผ่าน Material อยู่ในคิว Material แม้เปลี่ยนสถานะ Invoice/Pay
- [ ] Draft/Rejected/Closed/อยู่ระหว่างขอแก้ไข ไม่ถูกเสนอให้ตรวจหรือรับอย่างผิดเงื่อนไข
- [ ] ทั้งโฟลว์รับก่อนจ่ายและจ่ายก่อนรับต้องผ่าน Material ก่อนรับจริง
- [ ] หลังผ่าน Material แล้ว ยังต้องถึงเงื่อนไขพร้อมรับเดิม และต้องกรอกจำนวนรับเอง
- [ ] รับบางส่วน/รับครบ/ป้องกันจำนวนเกิน/ประเมินผู้ขาย/ส่ง CMG Store ทำงานในขั้นรับจริงตามเดิม
- [ ] ยืนยัน Material ไม่เปลี่ยนยอดรับ คงเหลือ Budget, Balance, VAT, มัดจำ หรือยอดจ่าย
- [ ] ทุกทางอนุมัติ PO/บันทึก Invoice/บันทึกและแก้ Pay ไม่สร้าง Auto Receive ของ PO Material
- [ ] อัปโหลดล้มเหลว/กดซ้ำ/หลายผู้ใช้/Modal ค้าง ไม่ทำให้ข้ามขั้นหรือบันทึกซ้ำ
- [ ] สิทธิ์ดู/อัปโหลด/ยืนยัน/รับจริงถูกต้อง และเปิดเอกสารย้อนหลังได้
- [ ] PO ที่ไม่ใช่ Material ใช้ Auto Receive และจ่ายก่อนรับเหมือนเดิม
- [ ] ทดสอบส่วนที่เกี่ยวข้องและ production build ผ่าน พร้อมบันทึกผลจริงก่อน deploy

## 9. ประวัติการดำเนินการ

| วันที่ (ประเทศไทย) | งานที่ทำจริง | สถานะ |
| --- | --- | --- |
| 2026-10-15 (15 ต.ค. 2569) | ตรวจ Create PR, PO และ Receive; พบแท็บ Material Received ยังว่าง และวางแผนแยกผลตรวจออกจากจำนวนรับจริง | ตรวจโค้ดและวางแผนแล้ว |
| 2026-10-15 (15 ต.ค. 2569) | ตรวจตัวเลือกจ่ายก่อนรับ/รับของแล้ว/Receive Auto และจุดสร้าง Receive ใน PO, Context, Invoice, Pay; พบเส้นทางที่อาจข้ามขั้นและสถานะที่ทำให้รายการหาย | ตรวจโค้ดแล้ว ยังไม่แก้ระบบ |
| 2026-10-15 (15 ต.ค. 2569) | ปรับแผนให้จ่ายก่อนรับได้ แต่ปิดรับของแล้ว/Receive Auto เฉพาะ PO Material; แยกคิว Material จากสถานะการเงิน และคงเงื่อนไขพร้อมรับเดิมหลังผ่าน | ปรับแผนตามผู้ใช้ |
| 2026-10-15 (15 ต.ค. 2569) | สร้าง `MATERIAL_APPROVE_RECEIVE_PLAN.md` เพื่อเก็บแผนและประวัติ | บันทึกเอกสารแล้ว |

รายการในตารางด้านบนเป็นประวัติช่วงวางแผน ซึ่งในขณะนั้นแก้เฉพาะเอกสาร ยังไม่ได้แก้ source code หรือ deploy

เมื่อพัฒนาต่อ ให้เพิ่มประวัติเป็นรายการใหม่โดยระบุวันที่จริง ไฟล์ที่แก้ พฤติกรรมที่เปลี่ยน ผลทดสอบ และสถานะ deploy แยกจากกัน ห้ามเปลี่ยนสถานะงานในแผนเป็นเสร็จจนกว่าจะดำเนินการจริง

## 10. ผลดำเนินการจริง — 15 ตุลาคม 2569 (2026-10-15)

ผู้ใช้อนุญาตให้พัฒนาและทดสอบ โดยกำชับไม่ให้กระทบฟังก์ชันคำนวณเดิม

### ไฟล์ที่แก้และพฤติกรรมที่เพิ่ม

| ไฟล์ | งานที่ทำจริง |
| --- | --- |
| `src/views/PRView.tsx` | เพิ่ม Material Approve และ No., บังคับ No. เมื่อเช็ค, โหลดค่าเมื่อแก้ PR, แสดงในรายละเอียด และ reset เมื่อสร้างใหม่ |
| `src/views/POView.tsx` | บันทึก snapshot, รองรับหลาย PR, ปิด Receive Auto/รับของแล้วเฉพาะ PO Material, จ่ายก่อนรับยังเลือกได้, ป้องกัน SP/DC และการเปลี่ยนข้อมูลที่ตรวจไปแล้ว |
| `src/views/ReceiveView.tsx` | แยกคิวรอตรวจ Material จากคิวรับจริง, ค้นหา PO/PR/No./ผู้จำหน่าย, เปิดประวัติผลตรวจ, เปิด Modal ใหม่ และตรวจเงื่อนไขก่อนรับจริง |
| `src/components/MaterialReceivedModal.tsx` | แสดงสินค้าโดยไม่มีช่องจำนวนรับจริงหรือยอดเงิน, แนบ Certificate หลายไฟล์, หมายเหตุ, ยืนยัน, ผู้ตรวจ/เวลา และดูเอกสารย้อนหลัง |
| `src/lib/materialReceive.ts` | รวมเงื่อนไข Material, snapshot, validation ไฟล์ และขอบเขตข้อมูลที่ตรวจ โดยไม่มีสูตรคำนวณเงิน |
| `src/lib/materialReceiveStore.ts` | ยืนยัน Material ด้วย transaction ที่เขียนเฉพาะ `materialReceive`; อ่าน PO ล่าสุดก่อนสร้าง Receive และตรวจว่ารายการไม่เปลี่ยนระหว่างเปิด Modal |
| `src/lib/poDocumentFlow.ts` | กัน configured Auto Receive และสถานะรับเสร็จอัตโนมัติเฉพาะ PO Material; คงการสร้าง Invoice และสูตรเดิม |
| `src/lib/receiveAuto.ts` | ไม่สร้าง Auto Receive สำหรับ PO Material แม้ผ่าน Material แล้ว |
| `src/contexts/AppDataContext.tsx` | การสร้าง Receive ที่มี poId ผ่าน transaction ตรวจ PO ล่าสุด; ส่ง payload จำนวน/เงินเดิมเข้า database โดยไม่คำนวณใหม่ |
| `src/views/BillingPayView.tsx` | ข้ามการสร้าง Auto Receive สำหรับ PO Material และไม่ลบ Receive เดิมของกลุ่มนี้ในขั้น sync อัตโนมัติ |
| `firestore.rules` | จำกัดการยืนยันให้ผู้มีสิทธิ์รับของในโครงการ, ป้องกันเขียนยอดเงินพร้อมผลตรวจ, กันรับก่อนผ่าน/Auto Receive, กันปลด snapshot ที่ล็อกแล้ว และกันเขียนทับผลตรวจ |
| `.gitignore` | ยกเว้นสำเนาก่อนแก้, build ทดสอบ และข้อมูล emulator ของงานนี้ใน `output/material-*` |
| `src/lib/materialReceive.test.js`, `src/lib/materialReceiveStore.test.js`, `src/components/MaterialReceivedModal.test.js` | เพิ่ม regression tests ของการแยกคิว, snapshot, การเงิน, transaction และ Modal |
| `scripts/run_material_receive_rules.cjs`, `scripts/test_material_receive_rules.cjs` | เพิ่มคำสั่งทดสอบสิทธิ์จริงกับ Firestore Emulator บน demo project เท่านั้น |

`InvoiceView.tsx` ไม่ต้องแก้เพิ่มสำหรับงานนี้ เพราะเส้นทางเดิมเรียก helper ที่เพิ่มเงื่อนไขไว้แล้ว งานแก้เดิมของผู้ใช้ในไฟล์นี้ถูกเก็บไว้ครบ

### ผลทดสอบและการตรวจผลกระทบ

1. ก่อนเริ่มแก้: ชุดเดิม **26 suites / 148 tests ผ่าน**
2. หลังพัฒนา: **29 suites / 196 tests ผ่าน** รวมของเดิมทั้งหมดและของใหม่ 48 tests
   - คำสั่ง: `npm.cmd test -- --watchAll=false --runInBand` โดยตั้ง `CI=true`
   - หลักฐาน: `output/material-approve-tests.log`
3. Firestore Emulator: ทดสอบบน `demo-material-approve` ผ่าน ทั้งสิทธิ์ข้ามโครงการ, ยืนยันพร้อม server timestamp, กันการรับก่อนผ่าน, กัน Auto Receive หลังผ่าน, กันเขียนทับผลตรวจ, การจ่ายเงิน/Invoice ยังอัปเดตได้, โฟลว์ Auto Receive เดิมยังใช้ได้ และการล็อก snapshot
   - คำสั่งรันทวน: `node scripts/run_material_receive_rules.cjs`
   - หลักฐาน: `output/material-rules-final.log`
   - ใช้เฉพาะ local emulator ไม่อ่านหรือเขียนฐานข้อมูล production
4. Production build **ผ่าน** โดยตั้ง `BUILD_PATH=output/material-approve-build` และ `CI=false` แล้วรัน `npm.cmd run build`
   - หลักฐาน: `output/material-approve-build.log`
   - แยก build ทดสอบออกจาก `build/` เดิม เพื่อรักษางานที่มีอยู่ก่อนเริ่ม
5. เทียบ AST กับสำเนาก่อนเริ่มงาน ยืนยันส่วนต่อไปนี้ไม่มีการเปลี่ยนแปลง:
   - `calculateTotals` ของ PO
   - `thisPrTotal` ของ PR
   - `receiveSummary`, `getReceiveProgress`, `executeSaveReceive` ของการรับของเดิม
   - `buildConfiguredInvoiceData`, `syncInvoiceSetupItems`, `syncReceiveSetupItems`
   - `generateReceiveNo`
   - `InvoiceView.tsx` ทั้งไฟล์ตรงกับสำเนาก่อนเริ่มงาน
   - หลักฐาน: `output/material-financial-audit.log`
6. Regression tests เปรียบเทียบข้อมูลเดียวกันเมื่อไม่เลือก Material / รอตรวจ / ผ่านแล้ว: ผล Invoice, มัดจำ, ส่วนลด, มูลค่า PO ก่อน VAT, allocation ของ PR และยอดใช้ Budget เท่าเดิม
7. `git diff --check` ของ source, rules และเอกสารที่เกี่ยวข้องผ่าน

### ข้อจำกัดและสถานะก่อนนำไปใช้จริง

- **ยังไม่ได้ deploy Hosting หรือ Firestore Rules และยังไม่ได้แก้ข้อมูล production**
- ก่อนเปิดใช้งานจริงต้องนำ Firestore Rules ที่ทดสอบแล้วขึ้นใช้งานร่วมกับแอป ไม่ควรเปิดแอปใหม่โดยใช้กฎเก่าที่ไม่มีการป้องกัน Material
- ทดสอบ Modal ด้วย React DOM/Jest และทดสอบสิทธิ์ด้วย Firestore Emulator แล้ว แต่ยังไม่ได้ทดสอบคลิกครบทั้ง PR → PO → Receive ด้วยบัญชีจริง หรืออัปโหลด Certificate ไป Storage จริง
- คำสั่ง standalone `npx tsc --noEmit` พบ syntax errors ใน declarations ของ dependencies ที่ติดตั้ง เช่น `@types/node`/`motion-dom` กับ TypeScript 4.4.4; ไม่แก้เวอร์ชัน dependencies ในงานนี้ ส่วน production build ผ่านแล้ว
- Build แจ้งเตือน Browserslist เก่าและ bundle ขนาดใหญ่ จึงไม่ปรับ dependency หรือโครงสร้างแอปที่ไม่เกี่ยวข้องในงานนี้
- หากอัปโหลดสำเร็จแต่ผล commit ไม่ชัดเจนจากเครือข่าย จะเก็บไฟล์ไว้และแจ้งให้เปิดสถานะล่าสุดก่อนลองใหม่ เพื่อไม่ลบไฟล์ที่อาจผูกกับผลตรวจที่บันทึกสำเร็จแล้ว

### ประวัติการแก้ไขรอบพัฒนา

| วันที่ (ประเทศไทย) | งานที่ทำ | ผล |
| --- | --- | --- |
| 2026-10-15 | สำรอง source ที่เกี่ยวข้องและรันทดสอบเดิมก่อนแก้ | 148 tests ผ่าน |
| 2026-10-15 | เพิ่มข้อมูล PR/PO, คิวและ Modal Material, Certificate/หมายเหตุ และผลตรวจแยกจาก Receive | พัฒนาใน workspace แล้ว |
| 2026-10-15 | กัน Auto Receive ทุกเส้นทางที่เกี่ยวข้อง, เพิ่ม transaction และ Firestore Rules | ทดสอบบน emulator ผ่าน |
| 2026-10-15 | ตรวจกรณี Draft เปลี่ยน PR, snapshot หลังส่งอนุมัติ, Modal ค้าง/กดซ้ำ, การแก้ PO หลังผ่าน Material และการจ่ายเงิน | Regression tests ผ่าน |
| 2026-10-15 | ทดสอบรวม, build และเทียบโค้ดคำนวณกับสำเนาก่อนแก้ | 196 tests และ build ผ่าน; ฟังก์ชันคำนวณที่ตรวจเทียบไม่เปลี่ยน |
| 2026-10-15 | อัปเดตเอกสารนี้ด้วยรายการไฟล์ ผลตรวจ และข้อจำกัด | บันทึกแล้ว; ยังไม่ deploy |

## 11. ปรับการลบจากคิวรับของ — 16 ตุลาคม 2569 (2026-10-16)

คำขอเพิ่มเติม: ปุ่มลบในแท็บ **รับของ** ตามภาพของผู้ใช้ เมื่อ PO มี **Receive Type = Material** ให้คืน PO เป็น Approved และกลับเป็นคำขอรอตรวจในแท็บ **Material Received** ส่วน Receive Type อื่นใช้พฤติกรรมเดิม

### พฤติกรรมและขอบเขตที่แก้

- ตรวจจาก `receiveType === "Material"` โดยตรง รวม PO เดิมที่ยังไม่มี flag Material Approve; ตั้ง `materialReceiveRequired = true`, `materialReceive.status = "pending"` และ `status`/`statusNow` เป็น `Approved`
- เมื่อสำเร็จ เปิดแท็บ Material Received ในมุมมองรายการรอตรวจและล้างคำค้น เพื่อให้เห็นรายการที่ส่งกลับ
- เก็บ Certificate และหมายเหตุเดิมไว้ เมื่อยืนยันตรวจใหม่ให้รวมไฟล์เดิมกับไฟล์ใหม่ และบันทึกผู้ยืนยัน/เวลาของรอบใหม่
- ไม่เปลี่ยนจำนวนรับ สินค้า ยอดเงิน หรือสูตรคำนวณใด ๆ; หลังตรวจผ่านจึงกลับเข้าคิวรับของตามเงื่อนไขเดิม
- คงข้อห้ามเดิม: หาก PO มีจำนวนรับจริงแล้ว ปุ่มนี้ยังไม่ให้ย้อนสถานะ ต้องจัดการรายการรับที่แท็บรายการ Receive ก่อน
- Receive Type อื่นยังอัปเดตเฉพาะสถานะ Approved แบบเดิม แม้จะมี flag Material Approve; ไม่เปลี่ยนการลบเอกสาร Receive หรือการลบสินค้ารายบรรทัด

### ไฟล์ที่แก้ในรอบนี้

| ไฟล์ | การเปลี่ยนแปลง |
| --- | --- |
| `src/lib/materialReceive.ts` | เพิ่ม `buildReceiveQueueResetPatch` แยก payload สำหรับ Material กับประเภทอื่น |
| `src/views/ReceiveView.tsx` | ใช้ payload ใหม่ใน `handleDeleteReceivePo`, ปรับข้อความยืนยัน/ผลสำเร็จ/ประวัติ และเปิดคิว Material Received หลังสำเร็จ |
| `src/lib/materialReceiveStore.ts` | รักษา Certificate เดิมเมื่อยืนยันหลังส่งกลับมาตรวจใหม่ |
| `firestore.rules` | เพิ่มสิทธิ์ย้อนคิวเฉพาะ Material สำหรับผู้มีสิทธิ์ลบ Receive ในโครงการ; อนุญาตเปลี่ยนเฉพาะสถานะและ flag ที่จำเป็น โดยห้ามแก้ยอดเงินหรือเอกสารตรวจเดิมพร้อมกัน |
| `src/lib/materialReceive.test.js`, `src/lib/materialReceiveStore.test.js` | เพิ่ม 13 tests ครอบคลุม Material/ข้อมูลเก่า/ประเภทอื่น/ผลคำนวณเท่าเดิม/การรักษา Certificate |
| `scripts/test_material_receive_rules.cjs` | เพิ่มกรณี reset สำเร็จ, บล็อกข้ามโครงการ/ไม่มีสิทธิ์ลบ/แก้ยอดเงิน/ประเภทอื่น, รักษาเอกสารเดิม และบล็อกรับจริงจนตรวจใหม่ |

### ผลทดสอบจริง

1. ก่อนแก้: **30 suites / 228 tests ผ่าน** — `output/material-reset-before.log`
2. หลังแก้: **30 suites / 241 tests ผ่าน** — `output/material-reset-tests.log`
   - คำสั่ง `npm.cmd test -- --watchAll=false --runInBand` โดยตั้ง `CI=true`
3. Firestore Emulator ผ่าน รวมกรณีใหม่ทั้งหมด — `output/material-reset-rules.log`
   - คำสั่ง `node scripts/run_material_receive_rules.cjs`; ใช้เฉพาะ demo project ในเครื่อง
4. Production build ผ่าน — `output/material-reset-build.log`
   - `npm.cmd run build` โดยตั้ง `CI=false` และ `BUILD_PATH=output/material-reset-build`; ไม่เขียนทับ build เดิม
5. เทียบ AST กับสำเนาก่อนแก้รอบนี้: `getPoStatusAfterReceiveDocs`, `handleDeleteReceive`, `handleDeleteReceiveItem`, `executeSaveReceive`, `receiveSummary`, `getReceiveProgress` และเงื่อนไข `hasReceiveItems` ไม่เปลี่ยน — `output/material-reset-audit.log`
6. `git diff --check` ของไฟล์ที่แก้ในรอบนี้ผ่าน

**สถานะ:** พัฒนาและทดสอบในเครื่องแล้ว ยังไม่ได้ deploy แอป/Firestore Rules หรือแก้ข้อมูล production และยังไม่ได้ทดสอบคลิกด้วยบัญชีจริง ต้องนำ rules และแอปเวอร์ชันนี้ขึ้นใช้งานร่วมกัน

## 12. แนบไฟล์ Material Received ใน PDF รับของ — 16 ตุลาคม 2569 (2026-10-16)

คำขอเพิ่มเติม: เมื่อทำรับของรายการ **Receive Type = Material** ให้นำไฟล์ที่แนบในขั้นตอน Material Received มาใส่ใน PDF ต่อจาก PO และก่อนรูปภาพรับของ

### สิ่งที่แก้

- `src/lib/materialReceivePdf.ts`: เพิ่ม helper อ่าน `materialReceive.certificates` เฉพาะ Receive Type เท่ากับ `Material`; ดาวน์โหลดไฟล์ตามลำดับที่บันทึกไว้ แล้วรวม PDF ทุกหน้า หรือเพิ่มรูป PNG/JPG/WebP เป็นหน้า A4 โดยคงสัดส่วน รูป WebP แปลงเป็น PNG ภายใน browser ก่อนฝังลง PDF
- `src/views/ReceiveView.tsx`: เรียก helper หลังรวม PO และก่อนรวมรูปภาพรับของ ลำดับสุดท้ายคือ **ใบรับของ (RP) → PO → ไฟล์ Material Received → รูปภาพรับของ → INV (ถ้ามี)**
- ถ้า Material มี Certificate แต่สร้าง/รวม/อัปโหลด PDF ไม่สำเร็จ จะหยุดก่อนสร้าง Receive และแจ้งข้อผิดพลาด; กรณีไฟล์ Certificate อ่านไม่ได้จะแสดงชื่อไฟล์ ไม่บันทึก PDF ที่ขาดเอกสารแนบไปเงียบ ๆ ผู้ใช้ตรวจไฟล์และลองบันทึกใหม่ได้
- ประเภทอื่น หรือ Material ที่ไม่มีไฟล์แนบ ยังคงพฤติกรรม PDF เดิม ไม่แก้ลำดับ INV หรือสูตรคำนวณ จำนวนรับ payload รับของ การเปลี่ยนสถานะ และโฟลว์ลบ
- ใช้กับการทำรับของและสร้าง PDF ครั้งใหม่ ไม่แก้หรือสร้าง PDF ของรายการเก่าย้อนหลัง และไม่เพิ่มจำนวน Certificate เข้า `totalPhotos` ซึ่งยังนับเฉพาะรูปภาพรับของ

### ผลทดสอบจริง

1. ก่อนแก้ **30 suites / 241 tests ผ่าน** — `output/material-pdf-before.log`
2. หลังแก้ **31 suites / 252 tests ผ่าน** — `output/material-pdf-tests.log`
   - เพิ่ม `src/lib/materialReceivePdf.test.js` จำนวน 11 tests: PDF หลายหน้า/ลำดับไฟล์, PNG ชื่อภาษาไทย, ประเภทอื่น, ไม่มีไฟล์แนบ, ดาวน์โหลดล้มเหลว, PDF เสีย, URL หาย และการแปลง WebP พร้อมคืน object URL
   - ทดสอบ WebP ด้วย mock ของ browser Image/canvas; ยังไม่ได้ทดสอบไฟล์ WebP ผ่าน browser จริง
3. สร้าง PDF ตัวอย่างผ่าน helper จริง จำนวน 8 หน้า รวม PDF สองหน้า + PNG แนวนอน + JPG แนวตั้ง ระหว่างหน้า PO และรูปภาพรับของ/INV แล้ว render ด้วย Poppler และตรวจภาพครบทุกหน้า: ลำดับถูกต้อง ภาพคงสัดส่วนและไม่ถูกตัด — `output/material-pdf-check/combined.pdf`, `output/material-pdf-check/contact.png`
4. ตรวจเทียบ `ReceiveView.tsx` กับสำเนาก่อนรอบนี้ หลังตัดเฉพาะ 4 จุดที่เพิ่มเกี่ยวกับ PDF แล้วเนื้อหาทั้งไฟล์ตรงกัน ยืนยันส่วนคำนวณ จำนวนรับ payload สถานะ และการลบไม่เปลี่ยน; ตรวจลำดับการเรียกใน save flow จริงด้วย — `output/material-pdf-check/audit.cjs`
5. Production build **ผ่าน** โดยใช้ `BUILD_PATH=output/material-pdf-build`, `CI=false` — `output/material-pdf-build.log`; ไม่เขียนทับ build เดิม
6. `git diff --check` สำหรับไฟล์ที่แก้ในรอบนี้ผ่าน ไม่มีการแก้ Firestore Rules เพิ่มในรอบ PDF นี้

**สถานะ:** พัฒนาและทดสอบในเครื่องแล้ว ยังไม่ได้ deploy หรืออ่าน/เขียนข้อมูล production; ยังไม่ได้ทดสอบดาวน์โหลด Certificate จาก Storage ด้วยบัญชีจริง
