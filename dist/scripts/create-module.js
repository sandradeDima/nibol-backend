import { fileURLToPath } from "node:url";
import path from "node:path";
import { generateModuleScaffold } from "./module-generator/engine.js";
const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const backendRoot = path.resolve(currentDir, "..");
const moduleName = process.argv[2];
if (!moduleName) {
    console.error("Module name is required. Example: npm run create:module products");
    process.exit(1);
}
generateModuleScaffold({
    backendRoot,
    moduleName,
})
    .then((result) => {
    console.log(`Created module scaffold for "${result.names.routeSegment}".`);
    console.log(`Backend: ${result.backendModuleDir}`);
    console.log(`Frontend: ${result.frontendModuleDir}`);
})
    .catch((error) => {
    const message = error instanceof Error ? error.message : "Module generation failed.";
    console.error(message);
    process.exit(1);
});
//# sourceMappingURL=create-module.js.map