import { Router } from "express";
import { db } from "@workspace/db";
import { transportTypesTable, transitLinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = Router();

// Admin-only — seed transport types and Cairo metro/monorail/train lines
router.post("/", requireAdmin, async (req, res) => {
  try {
    const results: string[] = [];

    const types = [
      { nameEn: "Metro", nameAr: "مترو", icon: "metro", color: "#8B5CF6", basePriceEgp: "10", pricePerKmEgp: "0", averageSpeedKmh: "40", foreignerAllowed: true, isActive: true },
      { nameEn: "Monorail", nameAr: "مونوريل", icon: "monorail", color: "#EC4899", basePriceEgp: "20", pricePerKmEgp: "0", averageSpeedKmh: "50", foreignerAllowed: true, isActive: true },
      { nameEn: "Train", nameAr: "قطار", icon: "train", color: "#F59E0B", basePriceEgp: "30", pricePerKmEgp: "1", averageSpeedKmh: "60", foreignerAllowed: true, isActive: true },
      { nameEn: "Bus (CTA)", nameAr: "أتوبيس", icon: "bus", color: "#3B82F6", basePriceEgp: "13", pricePerKmEgp: "0.5", averageSpeedKmh: "20", foreignerAllowed: true, isActive: true },
      { nameEn: "Microbus", nameAr: "ميكروباص", icon: "bus", color: "#10B981", basePriceEgp: "3", pricePerKmEgp: "0.5", averageSpeedKmh: "25", foreignerAllowed: true, isActive: true },
      { nameEn: "Tuktuk", nameAr: "توك توك", icon: "bike", color: "#F97316", basePriceEgp: "5", pricePerKmEgp: "2", averageSpeedKmh: "20", foreignerAllowed: true, isActive: true },
      { nameEn: "White Taxi", nameAr: "تاكسي أبيض", icon: "car", color: "#64748B", basePriceEgp: "10", pricePerKmEgp: "3", averageSpeedKmh: "30", foreignerAllowed: true, isActive: true },
      { nameEn: "Uber / Careem", nameAr: "أوبر / كريم", icon: "car", color: "#06B6D4", basePriceEgp: "15", pricePerKmEgp: "4", averageSpeedKmh: "35", foreignerAllowed: true, isActive: true },
    ];

    const typeMap: Record<string, string> = {};
    for (const t of types) {
      const existing = await db.select().from(transportTypesTable).where(eq(transportTypesTable.nameEn, t.nameEn)).limit(1);
      if (existing.length > 0) {
        typeMap[t.nameEn] = existing[0].id;
      } else {
        const [inserted] = await db.insert(transportTypesTable).values(t as any).returning();
        typeMap[t.nameEn] = inserted.id;
        results.push(`Created transport type: ${t.nameEn}`);
      }
    }

    const metroLines = [
      {
        nameEn: "Metro Line 1", nameAr: "مترو خط 1",
        lineNumber: "M1", typeKey: "Metro",
        fromArea: "Helwan", toArea: "New El Marg",
        viaStops: ["Ain Helwan", "Wadi Hof", "Maadi", "Dar El Salam", "Mar Girgis", "Sayyida Zeinab", "Saad Zaghloul", "Sadat", "Nasser", "Orabi", "Al Shohadaa", "Ghamra", "El Demerdash", "Ain Shams", "El Marg"],
        priceEgp: "10",
      },
      {
        nameEn: "Metro Line 2", nameAr: "مترو خط 2",
        lineNumber: "M2", typeKey: "Metro",
        fromArea: "Shobra El Kheima", toArea: "El Mounib",
        viaStops: ["Rod El Farag", "Al Shohadaa", "Attaba", "Mohamed Naguib", "Sadat", "Opera", "Dokki", "El Bohoos", "Cairo University", "Faisal", "Giza", "Omm El Masryeen", "Sakiat Mekky"],
        priceEgp: "10",
      },
      {
        nameEn: "Metro Line 3", nameAr: "مترو خط 3",
        lineNumber: "M3", typeKey: "Metro",
        fromArea: "Adly Mansour", toArea: "Kit Kat",
        viaStops: ["Haykestep", "Omar Ibn El Khattab", "Hesham Barakat", "El Nozha", "Nadi El Shams", "Haroun", "Al Ahram", "Heliopolis", "Fairmont", "Cairo Fair", "Abbasiya", "Attaba", "Bab El Shaaria", "El Masarra"],
        priceEgp: "10",
      },
    ];

    const monorailLines = [
      {
        nameEn: "Monorail East (NAC)", nameAr: "مونوريل شرق (العاصمة الإدارية)",
        lineNumber: "MR-E", typeKey: "Monorail",
        fromArea: "Adly Mansour Metro", toArea: "New Administrative Capital",
        viaStops: ["Nasr City", "El Salam", "El Obour", "El Ahl Stadium", "NAC Central Station"],
        priceEgp: "20",
      },
      {
        nameEn: "Monorail West (6th October)", nameAr: "مونوريل غرب (السادس من أكتوبر)",
        lineNumber: "MR-W", typeKey: "Monorail",
        fromArea: "Cairo University", toArea: "6th October City",
        viaStops: ["Giza Square", "Harraniya", "Remaya Square", "Sheikh Zayed", "6th October Center"],
        priceEgp: "20",
      },
    ];

    const trainLines = [
      {
        nameEn: "Train: Cairo – Alexandria", nameAr: "قطار: القاهرة – الإسكندرية",
        lineNumber: "TR-ALX", typeKey: "Train",
        fromArea: "Cairo (Ramses Station)", toArea: "Alexandria (Misr Station)",
        viaStops: ["Tanta", "Damanhour", "Sidi Gaber"],
        priceEgp: "60",
      },
      {
        nameEn: "Train: Cairo – Assiut", nameAr: "قطار: القاهرة – أسيوط",
        lineNumber: "TR-AST", typeKey: "Train",
        fromArea: "Cairo (Ramses Station)", toArea: "Assiut",
        viaStops: ["Giza", "Beni Suef", "Minya", "Mallawi"],
        priceEgp: "80",
      },
      {
        nameEn: "Train: Cairo – Luxor / Aswan", nameAr: "قطار: القاهرة – الأقصر / أسوان",
        lineNumber: "TR-LXR", typeKey: "Train",
        fromArea: "Cairo (Ramses Station)", toArea: "Aswan",
        viaStops: ["Assiut", "Sohag", "Qena", "Luxor"],
        priceEgp: "150",
      },
    ];

    for (const line of [...metroLines, ...monorailLines, ...trainLines]) {
      const typeId = typeMap[line.typeKey];
      if (!typeId) continue;
      const existing = await db.select().from(transitLinesTable)
        .where(eq(transitLinesTable.lineNumber, line.lineNumber)).limit(1);
      if (existing.length > 0) {
        results.push(`Skipped (already exists): ${line.nameEn}`);
        continue;
      }
      await db.insert(transitLinesTable).values({
        transportTypeId: typeId,
        lineNumber: line.lineNumber,
        nameEn: line.nameEn,
        nameAr: line.nameAr,
        fromArea: line.fromArea,
        toArea: line.toArea,
        viaStops: line.viaStops,
        priceEgp: line.priceEgp,
        isActive: true,
        frequencyMinutes: line.typeKey === "Train" ? 120 : 10,
        hasFixedStops: true,
      } as any);
      results.push(`Seeded: ${line.nameEn}`);
    }

    res.json({ success: true, results });
  } catch (err: any) {
    console.error("Seed error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
