import { z } from "zod";
import { calculatorSchema, newBathroom, type CalculatorConfig } from "@/lib/calculator";

const measurement = z.number().finite().min(0).max(100_000).nullable();
const roomSchema = z.object({
  name: z.string().max(100),
  type: z.enum(["bathroom", "kitchen", "living", "bedroom", "hall", "other"]),
  floorM2: measurement,
  perimeterM: measurement,
  wallHeightM: measurement,
  openingsM2: measurement,
  showers: z.number().int().min(0).max(10).nullable(),
  baths: z.number().int().min(0).max(10).nullable(),
  toilets: z.number().int().min(0).max(10).nullable(),
  basins: z.number().int().min(0).max(10).nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.string().max(1000),
});
export const planSchema = z.object({
  unit: z.enum(["m", "cm", "unknown"]),
  scale: z.string().max(80).nullable(),
  rooms: z.array(roomSchema).max(40),
  notes: z.array(z.string().max(240)).max(12),
});

export type PlanRoom = z.infer<typeof roomSchema>;
export type PlanRead = z.infer<typeof planSchema>;

export const MAX_PLAN_BYTES = 3_800_000;

/** Validate the complete proposal before changing any calculator values. */
export function applyPlanMeasurements(config: CalculatorConfig, input: unknown, applyFloorArea = false): CalculatorConfig {
  const plan = planSchema.parse(input);
  const rooms = plan.rooms.filter(room => room.type === "bathroom");
  if (rooms.length > 12) throw new Error("Een calculatie ondersteunt maximaal 12 badkamers. Voer deze tekening handmatig in.");
  if (rooms.some(room => (room.basins ?? 0) > 2)) throw new Error("Een badkamer ondersteunt maximaal 2 wasbakken. Verdeel deze ruimte handmatig over meerdere badkamers.");
  const bathrooms = rooms.length ? rooms.map(room => ({
    ...newBathroom(), m2: room.floorM2 ?? 0, perimeter: room.perimeterM ?? 0,
    height: room.wallHeightM ?? 0, openings: room.openingsM2 ?? 0,
    showers: room.showers ?? 0, baths: room.baths ?? 0, toilets: room.toilets ?? 0,
    basins: (room.basins ?? 0) as 0 | 1 | 2,
    // Unknown dimensions must not trigger the calculator's square-room estimate.
    wallTiles: room.perimeterM != null && room.perimeterM > 0 && room.wallHeightM != null && room.wallHeightM > 0 && room.openingsM2 != null,
    floorTiles: room.floorM2 != null && room.floorM2 > 0,
  })) : config.bathrooms;
  const dimensions = { ...config.dimensions };
  if (applyFloorArea) {
    if (!plan.rooms.length || plan.rooms.some(room => room.floorM2 == null)) {
      throw new Error("Het totale woonoppervlak kan alleen worden overgenomen als alle ruimten een vloeroppervlak hebben.");
    }
    dimensions.woonoppervlak_m2 = plan.rooms.reduce((sum, room) => sum + (room.floorM2 ?? 0), 0);
  }
  return calculatorSchema.parse({ ...config, bathrooms, dimensions });
}
