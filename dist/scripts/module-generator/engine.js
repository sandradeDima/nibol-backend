import fs from "node:fs/promises";
import path from "node:path";
import { buildModuleNames } from "./casing.js";
import { renderBackendConstantsTemplate, renderBackendControllerTemplate, renderBackendPermissionsTemplate, renderBackendRoutesTemplate, renderBackendSchemaTemplate, renderBackendServiceTemplate, renderBackendTypesTemplate, renderBackendValidatorsTemplate, renderFrontendAppCreatePageTemplate, renderFrontendAppEditPageTemplate, renderFrontendAppListPageTemplate, renderFrontendAppViewPageTemplate, renderFrontendConstantsTemplate, renderFrontendCreatePageTemplate, renderFrontendEditPageTemplate, renderFrontendFormTemplate, renderFrontendHookTemplate, renderFrontendListPageTemplate, renderFrontendTableTemplate, renderFrontendTypesTemplate, renderFrontendViewPageTemplate, } from "./templates.js";
const ensureDirectory = async (directoryPath) => {
    await fs.mkdir(directoryPath, {
        recursive: true,
    });
};
const pathExists = async (targetPath) => {
    try {
        await fs.access(targetPath);
        return true;
    }
    catch {
        return false;
    }
};
const writeFile = async (filePath, content) => {
    await fs.writeFile(filePath, content, "utf8");
};
const readModuleDirectories = async (modulesRoot) => {
    const entries = await fs.readdir(modulesRoot, {
        withFileTypes: true,
    });
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
};
const toDisplayLabel = (routeSegment) => {
    return routeSegment
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
};
const collectGeneratedModules = async (backendModulesRoot) => {
    const directories = await readModuleDirectories(backendModulesRoot);
    const modules = [];
    for (const directory of directories) {
        const routesFilePath = path.join(backendModulesRoot, directory, `${directory}.routes.ts`);
        const permissionsFilePath = path.join(backendModulesRoot, directory, `${directory}.permissions.ts`);
        try {
            await Promise.all([fs.access(routesFilePath), fs.access(permissionsFilePath)]);
            modules.push({
                label: toDisplayLabel(directory),
                permissionResource: directory.replace(/-/g, "_"),
                routeSegment: directory,
            });
        }
        catch {
            continue;
        }
    }
    return modules;
};
const renderBackendRegistry = (modules) => {
    const importLines = modules.map((module) => `import { ${module.routeSegment.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}Router } from "./${module.routeSegment}/${module.routeSegment}.routes.js";`);
    const routerNames = modules.map((module) => {
        return `${module.routeSegment.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())}Router`;
    });
    return `${importLines.join("\n")}${importLines.length > 0 ? "\n\n" : ""}export const generatedPermissionResources = [
${modules.map((module) => `  "${module.permissionResource}",`).join("\n")}
] as const;

export const generatedModuleRouters = [
${routerNames.map((routerName) => `  ${routerName},`).join("\n")}
] as const;
`;
};
const renderFrontendRegistry = (modules) => {
    return `import { Package } from "lucide-react";

export const generatedPermissionResources = [
${modules
        .map((module) => `  {
    key: "${module.permissionResource}",
    label: "${module.label}",
  },`)
        .join("\n")}
] as const;

export const generatedSidebarItems = [
${modules
        .map((module) => `  {
    icon: Package,
    label: "${module.label}",
    permission: "${module.permissionResource}.view",
    route: "/${module.routeSegment}",
  },`)
        .join("\n")}
];
`;
};
const rebuildGeneratedRegistries = async (backendRoot, frontendRoot) => {
    const backendModulesRoot = path.join(backendRoot, "src", "modules");
    const modules = await collectGeneratedModules(backendModulesRoot);
    await writeFile(path.join(backendModulesRoot, "generated-module-registry.ts"), renderBackendRegistry(modules));
    await writeFile(path.join(frontendRoot, "src", "modules", "generated-module-registry.ts"), renderFrontendRegistry(modules));
};
const createBackendFiles = async (backendRoot, names) => {
    const moduleDirectory = path.join(backendRoot, "src", "modules", names.routeSegment);
    await ensureDirectory(moduleDirectory);
    await Promise.all([
        writeFile(path.join(moduleDirectory, `${names.fileStem}.constants.ts`), renderBackendConstantsTemplate(names)),
        writeFile(path.join(moduleDirectory, `${names.fileStem}.permissions.ts`), renderBackendPermissionsTemplate(names)),
        writeFile(path.join(moduleDirectory, `${names.fileStem}.schema.ts`), renderBackendSchemaTemplate(names)),
        writeFile(path.join(moduleDirectory, `${names.fileStem}.validators.ts`), renderBackendValidatorsTemplate(names)),
        writeFile(path.join(moduleDirectory, `${names.fileStem}.types.ts`), renderBackendTypesTemplate(names)),
        writeFile(path.join(moduleDirectory, `${names.fileStem}.service.ts`), renderBackendServiceTemplate(names)),
        writeFile(path.join(moduleDirectory, `${names.fileStem}.controller.ts`), renderBackendControllerTemplate(names)),
        writeFile(path.join(moduleDirectory, `${names.fileStem}.routes.ts`), renderBackendRoutesTemplate(names)),
    ]);
};
const createFrontendFiles = async (frontendRoot, names) => {
    const moduleDirectory = path.join(frontendRoot, "src", "modules", names.routeSegment);
    const pagesDirectory = path.join(moduleDirectory, "pages");
    const componentsDirectory = path.join(moduleDirectory, "components");
    const hooksDirectory = path.join(moduleDirectory, "hooks");
    const appDirectory = path.join(frontendRoot, "src", "app", "(app)", names.routeSegment);
    const appDetailDirectory = path.join(appDirectory, `[${names.pageParam}]`);
    const appEditDirectory = path.join(appDetailDirectory, "edit");
    const appCreateDirectory = path.join(appDirectory, "new");
    await Promise.all([
        ensureDirectory(moduleDirectory),
        ensureDirectory(pagesDirectory),
        ensureDirectory(componentsDirectory),
        ensureDirectory(hooksDirectory),
        ensureDirectory(appDirectory),
        ensureDirectory(appDetailDirectory),
        ensureDirectory(appEditDirectory),
        ensureDirectory(appCreateDirectory),
    ]);
    await Promise.all([
        writeFile(path.join(moduleDirectory, "constants.ts"), renderFrontendConstantsTemplate(names)),
        writeFile(path.join(moduleDirectory, "types.ts"), renderFrontendTypesTemplate(names)),
        writeFile(path.join(hooksDirectory, `use${names.entityLabelPlural}.ts`), renderFrontendHookTemplate(names)),
        writeFile(path.join(componentsDirectory, `${names.entityLabelSingular}Form.tsx`), renderFrontendFormTemplate(names)),
        writeFile(path.join(componentsDirectory, `${names.entityLabelSingular}Table.tsx`), renderFrontendTableTemplate(names)),
        writeFile(path.join(pagesDirectory, "list.tsx"), renderFrontendListPageTemplate(names)),
        writeFile(path.join(pagesDirectory, "create.tsx"), renderFrontendCreatePageTemplate(names)),
        writeFile(path.join(pagesDirectory, "edit.tsx"), renderFrontendEditPageTemplate(names)),
        writeFile(path.join(pagesDirectory, "view.tsx"), renderFrontendViewPageTemplate(names)),
        writeFile(path.join(appDirectory, "page.tsx"), renderFrontendAppListPageTemplate(names)),
        writeFile(path.join(appCreateDirectory, "page.tsx"), renderFrontendAppCreatePageTemplate(names)),
        writeFile(path.join(appDetailDirectory, "page.tsx"), renderFrontendAppViewPageTemplate(names)),
        writeFile(path.join(appEditDirectory, "page.tsx"), renderFrontendAppEditPageTemplate(names)),
    ]);
};
export const generateModuleScaffold = async ({ backendRoot, moduleName, }) => {
    const frontendRoot = path.resolve(backendRoot, "..", "frontend");
    const names = buildModuleNames(moduleName);
    const backendModuleDir = path.join(backendRoot, "src", "modules", names.routeSegment);
    const frontendModuleDir = path.join(frontendRoot, "src", "modules", names.routeSegment);
    const backendEntryFile = path.join(backendModuleDir, `${names.fileStem}.routes.ts`);
    const frontendEntryFile = path.join(frontendModuleDir, "constants.ts");
    if (await pathExists(backendEntryFile)) {
        throw new Error(`Module "${names.routeSegment}" already exists.`);
    }
    if (await pathExists(frontendEntryFile)) {
        throw new Error(`Frontend module "${names.routeSegment}" already exists.`);
    }
    await createBackendFiles(backendRoot, names);
    await createFrontendFiles(frontendRoot, names);
    await rebuildGeneratedRegistries(backendRoot, frontendRoot);
    return {
        backendModuleDir,
        frontendModuleDir,
        names,
    };
};
//# sourceMappingURL=engine.js.map