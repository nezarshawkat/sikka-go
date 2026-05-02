import { Router } from "express";
import { db } from "@workspace/db";
import { transportTypesTable, transitLinesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";

const router = Router();

interface TransportTypeSeed {
  nameEn: string; nameAr: string; icon: string; color: string;
  basePriceEgp: number; pricePerKmEgp: number; averageSpeedKmh: number;
  foreignerAllowed: boolean; isActive: boolean;
}
interface TransitLineSeed {
  nameEn: string; nameAr: string; lineNumber: string; typeKey: string;
  fromArea: string; toArea: string; viaStops: string[]; priceEgp: number;
  frequencyMinutes?: number; hasFixedStops?: boolean;
}

function stationPairs(
  typeKey: string, lineCode: string, nameArPrefix: string,
  stations: string[], priceEgp: number, freq: number
): TransitLineSeed[] {
  const pairs: TransitLineSeed[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const from = stations[i];
    const to = stations[i + 1];
    pairs.push({
      nameEn: `${lineCode}: ${from} → ${to}`,
      nameAr: `${nameArPrefix}: ${from} - ${to}`,
      lineNumber: `${lineCode}-${String(i + 1).padStart(2, "0")}`,
      typeKey,
      fromArea: from,
      toArea: to,
      viaStops: [],
      priceEgp,
      frequencyMinutes: freq,
      hasFixedStops: true,
    });
  }
  return pairs;
}

router.post("/", requireAdmin, async (_req, res) => {
  try {
    const results: string[] = [];

    const types: TransportTypeSeed[] = [
      { nameEn: "Metro",         nameAr: "مترو",          icon: "metro",    color: "#8B5CF6", basePriceEgp: 10, pricePerKmEgp: 0,   averageSpeedKmh: 40, foreignerAllowed: true, isActive: true },
      { nameEn: "Monorail",      nameAr: "مونوريل",        icon: "monorail", color: "#EC4899", basePriceEgp: 20, pricePerKmEgp: 0,   averageSpeedKmh: 50, foreignerAllowed: true, isActive: true },
      { nameEn: "Train",         nameAr: "قطار",            icon: "train",    color: "#F59E0B", basePriceEgp: 30, pricePerKmEgp: 1,   averageSpeedKmh: 60, foreignerAllowed: true, isActive: true },
      { nameEn: "Microbus",      nameAr: "ميكروباص",        icon: "bus",      color: "#10B981", basePriceEgp: 3,  pricePerKmEgp: 0.5, averageSpeedKmh: 25, foreignerAllowed: true, isActive: true },
      { nameEn: "Tuktuk",        nameAr: "توك توك",          icon: "bike",     color: "#F97316", basePriceEgp: 5,  pricePerKmEgp: 2,   averageSpeedKmh: 20, foreignerAllowed: true, isActive: true },
      { nameEn: "White Taxi",    nameAr: "تاكسي أبيض",      icon: "car",      color: "#64748B", basePriceEgp: 10, pricePerKmEgp: 3,   averageSpeedKmh: 30, foreignerAllowed: true, isActive: true },
      { nameEn: "Uber / Careem", nameAr: "أوبر / كريم",    icon: "car",      color: "#06B6D4", basePriceEgp: 15, pricePerKmEgp: 4,   averageSpeedKmh: 35, foreignerAllowed: true, isActive: true },
    ];

    const typeMap: Record<string, string> = {};
    for (const t of types) {
      const existing = await db.select().from(transportTypesTable).where(eq(transportTypesTable.nameEn, t.nameEn)).limit(1);
      if (existing.length > 0) {
        typeMap[t.nameEn] = existing[0].id;
        results.push(`Skipped (exists): transport type ${t.nameEn}`);
      } else {
        const [ins] = await db.insert(transportTypesTable).values(t).returning();
        typeMap[t.nameEn] = ins.id;
        results.push(`Seeded: transport type ${t.nameEn}`);
      }
    }

    // ─── Metro Line 1 (Helwan ↔ New El Marg) ────────────────────────────────
    const metro1Stations = [
      "Helwan", "Ain Helwan", "Wadi Hof", "Hadayek Helwan", "El Maasara",
      "Tora El Asmant", "Kozzika", "Tora El Balad", "Sakanat El Maadi", "Maadi",
      "Hadayek El Maadi", "Dar El Salam", "El Zahraa", "Mar Girgis", "El Malek El Saleh",
      "Al Qadess Mina", "Ain El Sira", "El Fustat", "Sayyida Zeinab", "Saad Zaghloul",
      "Sadat", "Nasser", "Orabi", "Al Shohadaa", "Ghamra",
      "El Demerdash", "Kobry El Qobba", "Hammamat El Qobba", "Saray El Qobba",
      "Hadayek El Zeitoun", "Helmeyet El Zeitoun", "El Matareyya", "Ain Shams",
      "Ezbet El Nakhl", "El Marg", "New El Marg",
    ];

    // ─── Metro Line 2 (Shobra El Kheima ↔ El Mounib) ────────────────────────
    const metro2Stations = [
      "Shobra El Kheima", "Kolleyet El Zeraa", "Mezallat", "Khalafawy", "St. Teresa",
      "Rod El Farag", "Massara", "Al Shohadaa", "Attaba", "Mohamed Naguib",
      "Sadat", "Opera", "Dokki", "El Bohoos", "Cairo University",
      "Faisal", "Giza", "Omm El Masryeen", "Sakiat Mekky", "El Mounib",
    ];

    // ─── Metro Line 3 (Adly Mansour ↔ Kit Kat, operational segment) ──────────
    const metro3Stations = [
      "Adly Mansour", "El Haykestep", "Omar Ibn El Khattab", "Qobaa",
      "Hesham Barakat", "El Nozha", "Nadi El Shams", "Haroun",
      "Al Ahram", "Heliopolis (Masr El Gedida)", "Fairmont", "Cairo Fair",
      "Abbasiya", "Abdou Pasha", "El Geish", "Bab El Shaaria",
      "Attaba", "Naguib", "Sadat", "Boulaq Abu El Ela", "Kit Kat",
    ];

    // ─── Monorail East (Adly Mansour → New Administrative Capital) ────────────
    const monorailEastStations = [
      "Adly Mansour Metro", "East Salam", "Mostorod", "Bashteel",
      "El Obour", "El Ahl Stadium", "NAC Sports City",
      "NAC Central Business District", "New Administrative Capital",
    ];

    // ─── Monorail West (Cairo University → 6th October) ─────────────────────
    const monorailWestStations = [
      "Cairo University", "Giza Square", "Harraniya", "Remaya Square",
      "Sheikh Zayed City", "6th October Center", "6th October City",
    ];

    // ─── Train Intercity (Cairo Ramses Station as hub) ────────────────────────
    const trainCairoAlexStations   = ["Cairo (Ramses)", "Benha", "Tanta", "Damanhour", "Sidi Gaber", "Alexandria (Misr Station)"];
    const trainCairoAssuitStations = ["Cairo (Ramses)", "Giza", "Beni Suef", "El Fashn", "Minya", "Abu Qurqas", "Mallawi", "Deir Mawas", "Assiut"];
    const trainCairoAswan          = ["Cairo (Ramses)", "Assiut", "Sohag", "Qena", "Luxor", "Idfu", "Kom Ombo", "Aswan"];
    const trainCairoPort           = ["Cairo (Ramses)", "Ismailia", "Port Said"];
    const trainCairoSuez           = ["Cairo (Ramses)", "El Qassasin", "Ismailia", "Suez"];

    const allLines: TransitLineSeed[] = [
      ...stationPairs("Metro", "M1", "مترو خط 1", metro1Stations, 10, 4),
      ...stationPairs("Metro", "M2", "مترو خط 2", metro2Stations, 10, 4),
      ...stationPairs("Metro", "M3", "مترو خط 3", metro3Stations, 10, 6),
      ...stationPairs("Monorail", "MR-E", "مونوريل شرق", monorailEastStations, 20, 10),
      ...stationPairs("Monorail", "MR-W", "مونوريل غرب", monorailWestStations, 20, 10),
      ...stationPairs("Train", "TR-ALX", "قطار القاهرة-الإسكندرية", trainCairoAlexStations, 60, 60),
      ...stationPairs("Train", "TR-AST", "قطار القاهرة-أسيوط", trainCairoAssuitStations, 80, 90),
      ...stationPairs("Train", "TR-ASW", "قطار القاهرة-أسوان", trainCairoAswan, 150, 120),
      ...stationPairs("Train", "TR-PSD", "قطار القاهرة-بورسعيد", trainCairoPort, 45, 90),
      ...stationPairs("Train", "TR-SUZ", "قطار القاهرة-السويس", trainCairoSuez, 30, 60),
    ];

    for (const line of allLines) {
      const typeId = typeMap[line.typeKey];
      if (!typeId) continue;
      const existing = await db.select().from(transitLinesTable)
        .where(eq(transitLinesTable.lineNumber, line.lineNumber)).limit(1);
      if (existing.length > 0) {
        results.push(`Skipped (exists): ${line.nameEn}`);
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
        frequencyMinutes: line.frequencyMinutes ?? 10,
        hasFixedStops: line.hasFixedStops ?? true,
      });
      results.push(`Seeded: ${line.nameEn}`);
    }

    res.json({ success: true, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Seed error:", err);
    res.status(500).json({ error: message });
  }
});

export default router;
