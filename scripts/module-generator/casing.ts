const toWords = (value: string): string[] => {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\s]+/g, "-")
    .split("-")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
};

const singularizeWord = (value: string): string => {
  if (value.endsWith("ies") && value.length > 3) {
    return `${value.slice(0, -3)}y`;
  }

  if (value.endsWith("sses") && value.length > 4) {
    return value.slice(0, -2);
  }

  if (value.endsWith("ses") && value.length > 3) {
    return value.slice(0, -2);
  }

  if (value.endsWith("s") && value.length > 1 && !value.endsWith("ss")) {
    return value.slice(0, -1);
  }

  return value;
};

const toPascalCase = (words: string[]): string => {
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("");
};

export type ModuleNames = {
  constantPrefix: string;
  entityLabelPlural: string;
  entityLabelSingular: string;
  entityNamePlural: string;
  entityNameSingular: string;
  fileStem: string;
  hookName: string;
  pageParam: string;
  permissionResource: string;
  routeSegment: string;
};

export const buildModuleNames = (value: string): ModuleNames => {
  const words = toWords(value);

  if (words.length === 0) {
    throw new Error("Module name must contain at least one alphanumeric character.");
  }

  const pluralWords = [...words];
  const singularWords = [...words];
  singularWords[singularWords.length - 1] = singularizeWord(
    singularWords[singularWords.length - 1] ?? "",
  );

  const routeSegment = pluralWords.join("-");
  const permissionResource = pluralWords.join("_");
  const entityNamePlural = pluralWords.join("");
  const entityNameSingular = singularWords.join("");
  const entityLabelPlural = toPascalCase(pluralWords);
  const entityLabelSingular = toPascalCase(singularWords);

  return {
    constantPrefix: pluralWords.join("_").toUpperCase(),
    entityLabelPlural,
    entityLabelSingular,
    entityNamePlural,
    entityNameSingular,
    fileStem: routeSegment,
    hookName: `use${entityLabelPlural}`,
    pageParam: `${entityNameSingular}Id`,
    permissionResource,
    routeSegment,
  };
};
