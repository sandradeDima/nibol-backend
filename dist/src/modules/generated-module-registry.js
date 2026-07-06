import { configurationRouter } from "./configuration/configuration.routes.js";
import { observationsRouter } from "./observations/observations.routes.js";
import { progressRouter } from "./progress/progress.routes.js";
import { productsRouter } from "./products/products.routes.js";
import { remediationRouter } from "./remediation/remediation.routes.js";
export const generatedPermissionResources = [
    "areas",
    "risk_levels",
    "observation_statuses",
    "system_parameters",
    "catalogs",
    "products",
    "observations",
];
export const generatedModuleRouters = [
    configurationRouter,
    observationsRouter,
    progressRouter,
    remediationRouter,
    productsRouter,
];
//# sourceMappingURL=generated-module-registry.js.map