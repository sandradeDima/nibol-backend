import { deflateRawSync } from "node:zlib";

import type { ReportDashboardData } from "./reports.types.js";

type ReportExportInput = {
  charts?: ReportDashboardData["charts"];
  columns: string[];
  filters: Record<string, unknown>;
  generatedAt: string;
  reportName: string;
  rows: Array<Record<string, unknown>>;
  summary?: ReportDashboardData["summary"];
};

const escapeXml = (value: unknown): string =>
  String(value ?? "")
    // XML 1.0 disallows these control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const stringifyCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const isIsoDate = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));

const excelSerial = (value: string): number =>
  (Date.parse(value) - Date.parse("1899-12-30T00:00:00.000Z")) / 86_400_000;

const columnName = (column: number): string => {
  let value = column + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
};

const excelCell = (value: unknown, reference: string, style = 0): string => {
  if (typeof value === "number" && Number.isFinite(value))
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  if (typeof value === "boolean")
    return `<c r="${reference}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  const text = stringifyCell(value);
  if (isIsoDate(text))
    return `<c r="${reference}" s="4"><v>${excelSerial(text)}</v></c>`;
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
};

const excelRow = (
  values: unknown[],
  rowNumber: number,
  styles?: number[],
  height?: number,
) =>
  `<row r="${rowNumber}"${height ? ` ht="${height}" customHeight="1"` : ""}>${values
    .map((value, column) =>
      excelCell(
        value,
        `${columnName(column)}${rowNumber}`,
        styles?.[column] ?? 0,
      ),
    )
    .join("")}</row>`;

const worksheet = (
  rows: unknown[][],
  options: {
    autoFilter?: string;
    freezeRows?: number;
    mergeCells?: string[];
    rowHeights?: number[];
    rowStyles?: (row: unknown[], index: number) => number[] | undefined;
    showGridLines?: boolean;
    widths?: number[];
    zoomScale?: number;
  } = {},
): string => {
  const cols = (options.widths ?? [])
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join("");
  return `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <sheetViews><sheetView workbookViewId="0"${options.showGridLines === false ? ' showGridLines="0"' : ""}${options.zoomScale ? ` zoomScale="${options.zoomScale}" zoomScaleNormal="${options.zoomScale}"` : ""}>${options.freezeRows ? `<pane ySplit="${options.freezeRows}" topLeftCell="A${options.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` : ""}</sheetView></sheetViews>
    ${cols ? `<cols>${cols}</cols>` : ""}
    <sheetData>${rows
      .map((row, index) =>
        excelRow(
          row,
          index + 1,
          options.rowStyles?.(row, index),
          options.rowHeights?.[index],
        ),
      )
      .join("")}</sheetData>
    ${options.autoFilter ? `<autoFilter ref="${options.autoFilter}"/>` : ""}
    ${options.mergeCells?.length ? `<mergeCells count="${options.mergeCells.length}">${options.mergeCells.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : ""}
  </worksheet>`;
};

const contentTypes =
  (): string => `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const workbookXml = `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView activeTab="0"/></bookViews>
  <sheets><sheet name="RESUMEN" sheetId="1" r:id="rId1"/><sheet name="DATOS" sheetId="2" r:id="rId2"/></sheets>
</workbook>`;

const workbookRels = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const summaryNumber = (
  summary: ReportDashboardData["summary"] | undefined,
  key: keyof ReportDashboardData["summary"],
  fallback = 0,
): number => {
  const value = summary?.[key];
  return typeof value === "number" ? value : fallback;
};

const crc32 = (data: Buffer): number => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const zip = (
  entries: Array<{ data: string | Buffer; name: string }>,
): Buffer => {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  entries.forEach(({ data, name }) => {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    const compressed = deflateRawSync(raw);
    const nameBuffer = Buffer.from(name, "utf8");
    const crc = crc32(raw);
    const header = Buffer.alloc(30 + nameBuffer.length);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);
    nameBuffer.copy(header, 30);
    local.push(Buffer.concat([header, compressed]));

    const entry = Buffer.alloc(46 + nameBuffer.length);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuffer.length, 28);
    entry.writeUInt16LE(0, 30);
    entry.writeUInt16LE(0, 32);
    entry.writeUInt16LE(0, 34);
    entry.writeUInt16LE(0, 36);
    entry.writeUInt32LE(0, 38);
    entry.writeUInt32LE(offset, 42);
    nameBuffer.copy(entry, 46);
    central.push(entry);
    offset += local.at(-1)!.length;
  });
  const localData = Buffer.concat(local);
  const centralData = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(localData.length, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([localData, centralData, end]);
};

const summaryRows = (
  summary: ReportDashboardData["summary"] | undefined,
  rows: Array<Record<string, unknown>>,
): unknown[][] => {
  const value = (key: keyof ReportDashboardData["summary"], fallback = 0) =>
    summaryNumber(summary, key, fallback);
  return [
    ["Indicador", "Valor"],
    ["Total observaciones", value("totalObservations", rows.length)],
    ["Pendientes", value("pendingObservations", rows.length)],
    ["Cerradas", value("closedObservations")],
    ["Total planes de acción", value("total", rows.length)],
    ["No iniciado", value("noIniciado")],
    ["Iniciado", value("iniciado")],
    ["Con avance", value("conAvance")],
    ["Concluido", value("concluido")],
    ["Vigentes", value("vigentes")],
    ["Vencidos", value("vencidos")],
    ["Reprogramados", value("reprogramados")],
    ["Cumplimiento (%)", value("compliancePercent")],
    ["Promedio resolución (días)", value("averageResolutionDays")],
  ];
};

const reportColumnGroup = (column: string): string => {
  if (column.includes("Observación")) return "Observación";
  if (/^(Área|Responsable|Solicitante|Cargad[oa] por)$/.test(column))
    return "Responsables y área";
  if (/^(Fecha|Días|Tiempo)/.test(column)) return "Fechas y plazos";
  if (/^(Estado|Resultado|Revisión|Riesgo|Avance|Cumplimiento)/.test(column))
    return "Estado y evaluación";
  return "Detalle del reporte";
};

const reportGroups = (columns: string[]) => {
  const labels = columns.map(reportColumnGroup);
  const groups = columns.map((column, index) =>
    index === 0 || labels[index] !== labels[index - 1] ? labels[index] : "",
  );
  const mergeCells: string[] = [];
  for (let start = 0; start < columns.length; ) {
    let end = start + 1;
    while (end < columns.length && labels[end] === labels[start]) end += 1;
    if (end - start > 1)
      mergeCells.push(`${columnName(start)}1:${columnName(end - 1)}1`);
    start = end;
  }
  return { groups, mergeCells };
};

export const buildExcelWorkbook = (input: ReportExportInput): Buffer => {
  const { columns, filters, generatedAt, reportName, rows } = input;
  const summary = [
    [reportName, ""],
    ["Generado", generatedAt.replace("T", " ").replace(/\.\d{3}Z$/, " UTC")],
    ...Object.entries(filters).map(([key, value]) => [
      key,
      stringifyCell(value),
    ]),
    ["", ""],
    ["Registros del reporte", rows.length],
    ...(input.summary ? summaryRows(input.summary, rows) : []),
    ...(
      [
        ["Riesgo", input.charts?.riskDistribution],
        ["Estado según plazo", input.charts?.deadlineDistribution],
        ["Estado del plan de acción", input.charts?.progressDistribution],
        ["Distribución por área", input.charts?.areaDistribution],
      ] as const
    ).flatMap(([title, items]) =>
      items?.length
        ? [
            ["", ""],
            [title, "Cantidad"],
            ...items.map((item) => [item.label, item.value]),
          ]
        : [],
    ),
  ];
  const { groups, mergeCells } = reportGroups(columns);
  const data = [
    groups,
    columns,
    ...rows.map((row) => columns.map((column) => row[column])),
  ];
  const widths = columns.map((column) =>
    Math.min(55, Math.max(18, column.length + 5)),
  );
  const entries: Array<{ data: string | Buffer; name: string }> = [
    { data: contentTypes(), name: "[Content_Types].xml" },
    {
      data: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      name: "_rels/.rels",
    },
    {
      data: workbookXml
        .replace('name="RESUMEN"', 'name="DATA"')
        .replace('name="DATOS"', 'name="FILTROS Y RESUMEN"'),
      name: "xl/workbook.xml",
    },
    { data: workbookRels, name: "xl/_rels/workbook.xml.rels" },
    { data: observationDetailStylesXml, name: "xl/styles.xml" },
    {
      data: worksheet(data, {
        autoFilter: `A2:${columnName(Math.max(0, columns.length - 1))}${data.length}`,
        freezeRows: 2,
        mergeCells,
        rowHeights: [15, 32.5],
        rowStyles: (_row, index) =>
          index < 2
            ? columns.map(
                (_, column) =>
                  [1, 2, 3, 5][
                    (groups.slice(0, column + 1).filter(Boolean).length - 1) % 4
                  ] ?? 1,
              )
            : columns.map(() => 6),
        showGridLines: false,
        widths,
        zoomScale: 70,
      }),
      name: "xl/worksheets/sheet1.xml",
    },
    {
      data: worksheet(summary, {
        mergeCells: ["A1:B1"],
        rowStyles: (_row, index) => [index === 0 ? 1 : 6, index === 0 ? 1 : 6],
        widths: [32, 70],
      }),
      name: "xl/worksheets/sheet2.xml",
    },
  ];
  return zip(entries);
};

export const observationDetailHeaders = [
  "Informe de Auditoría",
  "Título de informe",
  "Fecha de informe",
  "Número de observación",
  "Observación principal",
  "Título de observación",
  "Observación detallada",
  "Recomendación",
  "Riesgos asociados",
  "Nivel de riesgo",
  "Fecha compromiso (vencimiento)",
  "Área",
  "Dueño de proceso",
  "Responsable de área",
  "Plan de acción",
  "Ejecutor (reporte)",
  "Fecha compromiso (plan de acción)",
  "N° reprogramacion",
  "Fecha reprogramación",
  "Comentario 1",
  "Comentario 2",
  "Estado según avance",
  "Estado según plazo",
  "Estado general OT",
] as const;

const observationDetailPlanColumns = [
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
];

const observationDetailPlanValue = (
  rows: unknown[][],
  column: number,
): string =>
  rows
    .map((row, index) => {
      const value = row[column];
      if (value === null || value === undefined || value === "") return "";
      let text = stringifyCell(value);
      if ((column === 16 || column === 18) && isIsoDate(text)) {
        const [year, month, day] = text.slice(0, 10).split("-");
        text = `${day}/${month}/${year}`;
      }
      return `${columnName(index)}. ${text}`;
    })
    .filter(Boolean)
    .join("\n");

const groupObservationDetailRows = (rows: unknown[][]): unknown[][] => {
  const groups = new Map<string, unknown[][]>();
  for (const row of rows) {
    const key = `${stringifyCell(row[0])}\u0000${stringifyCell(row[3])}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.values(), (group) => {
    const observation = [...group[0]!];
    for (const column of observationDetailPlanColumns)
      observation[column] = observationDetailPlanValue(group, column);
    return observation;
  });
};

const observationDetailStylesXml = `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy;@"/></numFmts>
  <fonts count="2"><font><sz val="10"/><color rgb="FF000000"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
  <fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5597"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFC00000"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF7030A0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF44546A"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
</styleSheet>`;

const observationDetailHeaderStyles = observationDetailHeaders.map(
  (_, index) =>
    index < 3
      ? 1
      : index < 14
        ? 2
        : index < 17
          ? 3
          : index < 19
            ? 2
            : index < 21
              ? 3
              : 5,
);

const observationDetailWidths = [
  12.33203125, 20.33203125, 18.83203125, 18.83203125, 27.6640625, 63.6640625,
  65.33203125, 65.33203125, 44.83203125, 13.5, 19.1640625, 19.1640625,
  19.1640625, 19.1640625, 55.33203125, 55.33203125, 32.5, 22.1640625, 18,
  48.6640625, 35.83203125, 18.5, 25.5, 26.6640625,
];

export const buildObservationDetailWorkbook = (input: {
  filters: Record<string, unknown>;
  generatedAt: string;
  reportName: string;
  rows: unknown[][];
}): Buffer => {
  const groups = Array.from(
    { length: observationDetailHeaders.length },
    () => "",
  );
  for (const [index, label] of [
    [0, "Informe"],
    [3, "Observación"],
    [14, "Plan de acción"],
    [17, "Reprogramación"],
    [19, "Comentario plan de acción"],
    [21, "Estados"],
  ] as const)
    groups[index] = label;
  const details = [
    groups,
    [...observationDetailHeaders],
    ...groupObservationDetailRows(input.rows),
  ];
  const filters = [
    [input.reportName, ""],
    ["Generado", input.generatedAt],
    ...Object.entries(input.filters).map(([key, value]) => [
      key,
      stringifyCell(value),
    ]),
  ];
  return zip([
    { data: contentTypes(), name: "[Content_Types].xml" },
    {
      data: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      name: "_rels/.rels",
    },
    {
      data: workbookXml
        .replace('name="RESUMEN"', 'name="DATA"')
        .replace('name="DATOS"', 'name="FILTROS"'),
      name: "xl/workbook.xml",
    },
    { data: workbookRels, name: "xl/_rels/workbook.xml.rels" },
    { data: observationDetailStylesXml, name: "xl/styles.xml" },
    {
      data: worksheet(details, {
        autoFilter: `A2:X${details.length}`,
        freezeRows: 2,
        mergeCells: ["A1:C1", "D1:N1", "O1:Q1", "R1:S1", "T1:U1", "V1:X1"],
        rowHeights: [15, 32.5],
        rowStyles: (_row, index) =>
          index < 2 ? observationDetailHeaderStyles : Array(24).fill(6),
        showGridLines: false,
        widths: observationDetailWidths,
        zoomScale: 70,
      }),
      name: "xl/worksheets/sheet1.xml",
    },
    {
      data: worksheet(filters, {
        mergeCells: ["A1:B1"],
        rowStyles: (_row, index) => [index === 0 ? 1 : 6, index === 0 ? 1 : 6],
        widths: [32, 70],
      }),
      name: "xl/worksheets/sheet2.xml",
    },
  ]);
};
