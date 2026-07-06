export const CONFIGURATION_CATALOG_TYPES = [
    "proceso_auditado",
    "tipo_observacion",
    "fuente_hallazgo",
    "categoria_hallazgo",
];
export const CONFIGURATION_ENTITY_TYPES = {
    area: "area",
    catalog: "catalog",
    observationStatus: "observation_status",
    riskLevel: "risk_level",
    systemParameter: "system_parameter",
};
export const CONFIGURATION_PERMISSIONS = {
    areas: {
        create: "areas.create",
        delete: "areas.delete",
        edit: "areas.edit",
        view: "areas.view",
    },
    catalogs: {
        create: "catalogs.create",
        delete: "catalogs.delete",
        edit: "catalogs.edit",
        view: "catalogs.view",
    },
    observationStatuses: {
        create: "observation_statuses.create",
        delete: "observation_statuses.delete",
        edit: "observation_statuses.edit",
        view: "observation_statuses.view",
    },
    riskLevels: {
        create: "risk_levels.create",
        delete: "risk_levels.delete",
        edit: "risk_levels.edit",
        view: "risk_levels.view",
    },
    systemParameters: {
        create: "system_parameters.create",
        delete: "system_parameters.delete",
        edit: "system_parameters.edit",
        view: "system_parameters.view",
    },
};
export const CONFIGURATION_BOOTSTRAP_PERMISSIONS = [
    "observations.view",
    "observations.create",
    "observations.edit",
    CONFIGURATION_PERMISSIONS.areas.view,
    CONFIGURATION_PERMISSIONS.riskLevels.view,
    CONFIGURATION_PERMISSIONS.observationStatuses.view,
    CONFIGURATION_PERMISSIONS.catalogs.view,
    CONFIGURATION_PERMISSIONS.systemParameters.view,
];
//# sourceMappingURL=configuration.constants.js.map