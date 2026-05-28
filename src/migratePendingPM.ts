import { collection, getDocs, updateDoc, doc } from "firebase/firestore";
import { db, appId } from "./lib/firebase";

export const migratePendingPMInvoices = async () => {
  console.log("Fetching invoices...");
  try {
    const ref = collection(db, "artifacts", appId, "public", "data", "invoices");
    const snap = await getDocs(ref);
    
    const updates: any[] = [];
    
    snap.forEach((d) => {
      const data = d.data();
      if (data.status === "Pending PM") {
        const paymentType = String(data.paymentType || "").trim();
        const newStatus = paymentType === "เครดิต" ? "Invcredit" : "paid";
        updates.push({
          id: d.id,
          invNo: data.invNo || "-",
          poRef: data.poRef || data.poNo || "-",
          vendorName: data.vendorName || "-",
          paymentType,
          currentStatus: data.status,
          newStatus,
          ref: doc(db, "artifacts", appId, "public", "data", "invoices", d.id)
        });
      }
    });

    console.table(updates.map(u => ({
      InvoiceNo: u.invNo,
      Ref: u.poRef,
      Vendor: u.vendorName,
      PaymentType: u.paymentType,
      CurrentStatus: u.currentStatus,
      WillChangeTo: u.newStatus
    })));
    console.log(`Found ${updates.length} invoices to update.`);
    
    if (updates.length > 0) {
      (window as any).confirmMigration = async () => {
        console.log("Starting migration...");
        let successCount = 0;
        for (const u of updates) {
          try {
            await updateDoc(u.ref, { status: u.newStatus, statusNow: u.newStatus });
            console.log(`✅ Updated invoice ${u.invNo} to ${u.newStatus}`);
            successCount++;
          } catch (err) {
            console.error(`❌ Failed to update ${u.invNo}:`, err);
          }
        }
        console.log(`Migration complete! Successfully updated ${successCount}/${updates.length} invoices.`);
        delete (window as any).confirmMigration;
      };
      console.log("➡️ Run confirmMigration() in the console to apply these changes.");
    } else {
      console.log("No invoices found with status 'Pending PM'.");
    }
  } catch (error) {
    console.error("Error fetching invoices:", error);
  }
};

// Attach to window for easy access in the console
(window as any).migratePendingPMInvoices = migratePendingPMInvoices;
