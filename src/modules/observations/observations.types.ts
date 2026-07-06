import type { z } from "zod";

import type {
  observationDetailSchema,
  observationFormOptionsSchema,
  observationListItemSchema,
} from "./observations.schema.js";
import type {
  createObservationSchema,
  listObservationsQuerySchema,
  updateObservationSchema,
} from "./observations.validators.js";

export type ObservationListItem = z.infer<typeof observationListItemSchema>;
export type ObservationDetail = z.infer<typeof observationDetailSchema>;
export type ObservationFormOptions = z.infer<typeof observationFormOptionsSchema>;
export type CreateObservationInput = z.infer<typeof createObservationSchema>;
export type UpdateObservationInput = z.infer<typeof updateObservationSchema>;
export type ListObservationsQuery = z.infer<typeof listObservationsQuerySchema>;
