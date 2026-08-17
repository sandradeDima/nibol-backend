const escapeXml = (value) => {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
};
const stringifyCell = (value) => {
    if (value === null || value === undefined)
        return "";
    if (typeof value === "object")
        return JSON.stringify(value);
    return String(value);
};
export const buildExcelWorkbook = ({ columns, filters, generatedAt, reportName, rows, }) => {
    const metadataRows = [
        ["Reporte", reportName],
        ["Generado", generatedAt],
        [
            "Filtros aplicados",
            Object.entries(filters)
                .map(([key, value]) => `${key}: ${stringifyCell(value)}`)
                .join(" · "),
        ],
    ];
    const rowXml = (values) => `<Row>${values.map((value) => `<Cell><Data ss:Type="String">${escapeXml(stringifyCell(value))}</Data></Cell>`).join("")}</Row>`;
    const dataRows = rows.map((row) => columns.map((column) => row[column]));
    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Reporte">
    <Table>
      ${metadataRows.map(rowXml).join("\n      ")}
      ${rowXml(columns)}
      ${dataRows.map(rowXml).join("\n      ")}
    </Table>
  </Worksheet>
</Workbook>`;
};
const escapePdfText = (value) => {
    return value
        .replaceAll("\\", "\\\\")
        .replaceAll("(", "\\(")
        .replaceAll(")", "\\)")
        .replaceAll("\n", " ");
};
const wrapText = (value, width = 105) => {
    const words = value.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach((word) => {
        if (line.length > 0 && `${line} ${word}`.length > width) {
            lines.push(line);
            line = word;
        }
        else {
            line = line.length > 0 ? `${line} ${word}` : word;
        }
    });
    if (line.length > 0)
        lines.push(line);
    return lines.length > 0 ? lines : [""];
};
export const buildSimplePdf = ({ columns, filters, generatedAt, reportName, rows, }) => {
    const lines = [
        reportName,
        `Generado: ${generatedAt}`,
        `Filtros: ${Object.entries(filters)
            .map(([key, value]) => `${key}: ${stringifyCell(value)}`)
            .join(" · ")}`,
        `Registros: ${rows.length}`,
        "",
        columns.join(" | "),
        ...rows.flatMap((row) => wrapText(columns.map((column) => stringifyCell(row[column])).join(" | "))),
    ];
    const pages = [];
    for (let index = 0; index < lines.length; index += 46) {
        pages.push(lines.slice(index, index + 46));
    }
    if (pages.length === 0)
        pages.push(["Sin registros"]);
    const objects = [];
    const pageObjectIds = [];
    const contentObjectIds = [];
    let nextObjectId = 5;
    pages.forEach((page, pageIndex) => {
        const contentLines = [
            "BT",
            "/F1 9 Tf",
            "48 790 Td",
            ...page.flatMap((line, lineIndex) => [
                lineIndex === 0 && pageIndex === 0 ? "/F1 15 Tf" : "/F1 9 Tf",
                `(${escapePdfText(line)}) Tj`,
                "0 -15 Td",
            ]),
            "ET",
        ];
        const content = contentLines.join("\n");
        const contentId = nextObjectId++;
        const pageId = nextObjectId++;
        contentObjectIds.push(contentId);
        pageObjectIds.push(pageId);
        objects[contentId] =
            `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream\nendobj\n`;
        objects[pageId] =
            `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`;
    });
    objects[1] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
    objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>\nendobj\n`;
    objects[4] =
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";
    let pdf = "%PDF-1.4\n";
    const offsets = [];
    for (let id = 1; id < objects.length; id += 1) {
        offsets[id] = Buffer.byteLength(pdf, "latin1");
        pdf += objects[id] ?? "";
    }
    const xrefOffset = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1) {
        pdf += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, "latin1");
};
//# sourceMappingURL=reports.exports.js.map