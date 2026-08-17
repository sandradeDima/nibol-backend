import { extensionRequestsRouter } from "./extension-requests/extension-requests.routes.js";
import { configurationRouter } from "./configuration/configuration.routes.js";
import { observationsRouter } from "./observations/observations.routes.js";
import { progressRouter } from "./progress/progress.routes.js";
import { productsRouter } from "./products/products.routes.js";
import { remediationRouter } from "./remediation/remediation.routes.js";
import { auditReportsRouter } from "./audit-reports/audit-reports.routes.js";
import { observationCatalogsRouter } from "./observation-catalogs/observation-catalogs.routes.js";
export const generatedPermissionResources = [
    "areas",
    "risk_levels",
    "observation_statuses",
    "system_parameters",
    "catalogs",
    "products",
    "observations",
    "extension_requests",
    "audit_reports",
    "observation_dictionary",
    "risks",
    "observation_areas",
    "action_plans",
    "progress_evaluations",
    "finding_evidence",
];
export const generatedModuleRouters = [
    auditReportsRouter,
    observationCatalogsRouter,
    configurationRouter,
    extensionRequestsRouter,
    observationsRouter,
    progressRouter,
    remediationRouter,
    productsRouter,
];
//# sourceMappingURL=generated-module-registry.js.map