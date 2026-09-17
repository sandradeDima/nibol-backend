import { deflateRawSync } from "node:zlib";
const escapeXml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
const stringifyCell = (value) => {
    if (value === null || value === undefined)
        return "";
    if (typeof value === "object")
        return JSON.stringify(value);
    return String(value);
};
const flattenFilters = (filters) => Object.entries(filters)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${stringifyCell(value)}`)
    .join(" · ") || "Sin filtros adicionales";
const isIsoDate = (value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
const excelSerial = (value) => (Date.parse(value) - Date.parse("1899-12-30T00:00:00.000Z")) / 86_400_000;
const columnName = (column) => {
    let value = column + 1;
    let result = "";
    while (value > 0) {
        const remainder = (value - 1) % 26;
        result = String.fromCharCode(65 + remainder) + result;
        value = Math.floor((value - 1) / 26);
    }
    return result;
};
const excelCell = (value, reference, style = 0) => {
    if (typeof value === "number" && Number.isFinite(value))
        return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
    if (typeof value === "boolean")
        return `<c r="${reference}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
    const text = stringifyCell(value);
    if (isIsoDate(text))
        return `<c r="${reference}" s="4"><v>${excelSerial(text)}</v></c>`;
    return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
};
const excelRow = (values, rowNumber, styles) => `<row r="${rowNumber}">${values
    .map((value, column) => excelCell(value, `${columnName(column)}${rowNumber}`, styles?.[column] ?? 0))
    .join("")}</row>`;
const worksheet = (rows, options = {}) => {
    const cols = (options.widths ?? [])
        .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
        .join("");
    return `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    ${cols ? `<cols>${cols}</cols>` : ""}
    <sheetViews><sheetView workbookViewId="0">${options.freezeRows ? `<pane ySplit="${options.freezeRows}" topLeftCell="A${options.freezeRows + 1}" activePane="bottomLeft" state="frozen"/>` : ""}</sheetView></sheetViews>
    <sheetData>${rows
        .map((row, index) => excelRow(row, index + 1, options.rowStyles?.(row, index)))
        .join("")}</sheetData>
    ${options.mergeCells?.length ? `<mergeCells count="${options.mergeCells.length}">${options.mergeCells.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : ""}
    ${options.autoFilter ? `<autoFilter ref="${options.autoFilter}"/>` : ""}
    ${options.drawing ? '<drawing r:id="rId1"/>' : ""}
  </worksheet>`;
};
const contentTypes = (withDrawing) => `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${withDrawing ? '<Default Extension="svg" ContentType="image/svg+xml"/>' : ""}
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${withDrawing ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}
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
const stylesXml = `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
  <fonts count="2"><font><sz val="10"/><color rgb="FF334155"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF102A43"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE9F0F7"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD7E0EA"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="6">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
</styleSheet>`;
const svgText = (value) => escapeXml(stringifyCell(value));
const colorFor = (item, index) => {
    const token = item.colorToken?.toLowerCase();
    if (token?.startsWith("#"))
        return token;
    if (["high", "alto", "critical", "critico", "crítico"].includes(token ?? ""))
        return "#D92D20";
    if (["medium", "medio", "moderate", "moderado"].includes(token ?? ""))
        return "#DC6803";
    if (["low", "bajo"].includes(token ?? ""))
        return "#027A48";
    if (["NOT_STARTED", "NI"].includes(item.key))
        return "#FACC15";
    if (["STARTED", "I"].includes(item.key))
        return "#0EA5E9";
    if (["WITH_PROGRESS", "CA"].includes(item.key))
        return "#F59E0B";
    if (["CONCLUDED", "CO"].includes(item.key))
        return "#16A34A";
    if (["VENCIDO", "vencidos", "OVERDUE"].includes(item.key))
        return "#D92D20";
    return ["#0B7285", "#2563EB", "#7C3AED", "#64748B", "#B45309"][index % 5];
};
const svgChart = (title, items, x, y, width, height) => {
    const visible = items.slice(0, 6);
    const max = Math.max(...visible.map((item) => item.value), 1);
    const barWidth = width - 190;
    return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="#F8FAFC" stroke="#D7E0EA"/>
    <text x="${x + 22}" y="${y + 32}" font-family="Aptos,Arial" font-size="17" font-weight="700" fill="#102A43">${svgText(title)}</text>
    ${visible.length
        ? visible
            .map((item, index) => {
            const rowY = y + 64 + index * 38;
            const label = item.label.length > 24
                ? `${item.label.slice(0, 23)}…`
                : item.label;
            return `<text x="${x + 22}" y="${rowY + 13}" font-family="Aptos,Arial" font-size="12" fill="#334155">${svgText(label)}</text><rect x="${x + 178}" y="${rowY}" width="${barWidth}" height="18" rx="9" fill="#E2E8F0"/><rect x="${x + 178}" y="${rowY}" width="${Math.max(5, (item.value / max) * barWidth)}" height="18" rx="9" fill="${colorFor(item, index)}"/><text x="${x + width - 22}" y="${rowY + 14}" text-anchor="end" font-family="Aptos,Arial" font-size="12" font-weight="700" fill="#102A43">${item.value}</text>`;
        })
            .join("")
        : `<text x="${x + 22}" y="${y + 86}" font-family="Aptos,Arial" font-size="13" fill="#64748B">Sin datos para este corte</text>`}
  </g>`;
};
const summaryNumber = (summary, key, fallback = 0) => {
    const value = summary?.[key];
    return typeof value === "number" ? value : fallback;
};
const buildDashboardSvg = (input) => {
    const total = summaryNumber(input.summary, "totalObservations", input.rows.length);
    const pending = summaryNumber(input.summary, "pendingObservations", input.rows.length);
    const closed = summaryNumber(input.summary, "closedObservations", 0);
    const filterText = flattenFilters(input.filters);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="860" viewBox="0 0 1200 860">
    <rect width="1200" height="860" fill="#FFFFFF"/>
    <rect width="1200" height="92" fill="#102A43"/><rect y="88" width="1200" height="4" fill="#C62828"/>
    <text x="42" y="42" font-family="Aptos,Arial" font-size="25" font-weight="700" fill="#FFFFFF">${svgText(input.reportName)}</text>
    <text x="42" y="69" font-family="Aptos,Arial" font-size="13" fill="#D7E0EA">Dashboard de reportería · ${svgText(input.generatedAt)}</text>
    <text x="1158" y="54" text-anchor="end" font-family="Aptos,Arial" font-size="12" fill="#D7E0EA">NIBOL</text>
    <text x="42" y="127" font-family="Aptos,Arial" font-size="12" fill="#64748B">Filtros: ${svgText(filterText.slice(0, 150))}</text>
    ${[
        ["Total observaciones", total, "#0B7285"],
        ["Pendientes", pending, "#D97706"],
        ["Cerradas", closed, "#16A34A"],
        [
            "Planes de acción",
            summaryNumber(input.summary, "total", input.rows.length),
            "#2563EB",
        ],
    ]
        .map(([label, value, color], index) => {
        const x = 42 + index * 278;
        return `<g><rect x="${x}" y="152" width="260" height="96" rx="10" fill="#F8FAFC" stroke="#D7E0EA"/><rect x="${x}" y="152" width="6" height="96" rx="3" fill="${color}"/><text x="${x + 22}" y="181" font-family="Aptos,Arial" font-size="12" fill="#64748B">${svgText(label)}</text><text x="${x + 22}" y="224" font-family="Aptos Display,Arial" font-size="31" font-weight="700" fill="#102A43">${value}</text></g>`;
    })
        .join("")}
    ${svgChart("Riesgo", input.charts?.riskDistribution ?? [], 42, 280, 544, 235)}
    ${svgChart("Estado de plazo", input.charts?.deadlineDistribution ?? [], 614, 280, 544, 235)}
    ${svgChart("Estado de avance", input.charts?.progressDistribution ?? [], 42, 542, 544, 235)}
    ${svgChart("Distribución por área", input.charts?.areaDistribution ?? [], 614, 542, 544, 235)}
  </svg>`;
};
const crc32 = (data) => {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1)
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
};
const zip = (entries) => {
    const local = [];
    const central = [];
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
        offset += local.at(-1).length;
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
const summaryRows = (summary, rows) => {
    const value = (key, fallback = 0) => summaryNumber(summary, key, fallback);
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
export const buildExcelWorkbook = (input) => {
    const { columns, filters, generatedAt, reportName, rows } = input;
    const filterText = flattenFilters(filters);
    const summary = [
        [reportName, ""],
        ["Generado", generatedAt.replace("T", " ").replace(/\.\d{3}Z$/, " UTC")],
        ["Filtros aplicados", filterText],
        ["", ""],
        ...summaryRows(input.summary, rows),
    ];
    const data = [
        columns,
        ...rows.map((row) => columns.map((column) => row[column])),
    ];
    const widths = columns.map((column) => Math.min(34, Math.max(14, column.length + 4)));
    const svg = input.charts ? buildDashboardSvg(input) : undefined;
    const entries = [
        { data: contentTypes(Boolean(svg)), name: "[Content_Types].xml" },
        {
            data: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
            name: "_rels/.rels",
        },
        { data: workbookXml, name: "xl/workbook.xml" },
        { data: workbookRels, name: "xl/_rels/workbook.xml.rels" },
        { data: stylesXml, name: "xl/styles.xml" },
        {
            data: worksheet(summary, {
                drawing: Boolean(svg),
                freezeRows: 5,
                mergeCells: ["A1:B1"],
                rowStyles: (_row, index) => index === 0
                    ? [1, 1]
                    : index === 4
                        ? [2, 2]
                        : index > 4
                            ? [3, 3]
                            : [3, 3],
                widths: [30, 70],
            }),
            name: "xl/worksheets/sheet1.xml",
        },
        {
            data: worksheet(data, {
                autoFilter: `A1:${columnName(Math.max(0, columns.length - 1))}${data.length}`,
                freezeRows: 1,
                rowStyles: (_row, index) => index === 0 ? columns.map(() => 2) : columns.map(() => 5),
                widths,
            }),
            name: "xl/worksheets/sheet2.xml",
        },
    ];
    if (svg) {
        entries.push({
            data: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
            name: "xl/worksheets/_rels/sheet1.xml.rels",
        }, {
            data: '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:oneCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>2</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="10500000" cy="7000000"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Dashboard de reportería"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>',
            name: "xl/drawings/drawing1.xml",
        }, {
            data: '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/report.svg"/></Relationships>',
            name: "xl/drawings/_rels/drawing1.xml.rels",
        }, { data: svg, name: "xl/media/report.svg" });
    }
    return zip(entries);
};
const pdfText = (value) => value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("\n", " ")
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("…", "...");
const pdfColor = (hex) => {
    const value = hex.replace("#", "");
    const channels = [0, 2, 4].map((index) => (Number.parseInt(value.slice(index, index + 2), 16) / 255).toFixed(3));
    return `${channels.join(" ")} rg`;
};
const pdfRect = (x, y, width, height, color) => `${pdfColor(color)} ${x} ${y} ${width} ${height} re f`;
const pdfLabel = (x, y, value, size = 9, bold = false, color = "#334155") => `${pdfColor(color)} BT /F${bold ? 2 : 1} ${size} Tf ${x} ${y} Td (${pdfText(value)}) Tj ET`;
const pdfBarList = (commands, title, items, x, y, width, height) => {
    commands.push(pdfRect(x, y, width, height, "#F8FAFC"));
    commands.push(pdfLabel(x + 14, y + height - 24, title, 12, true, "#102A43"));
    const visible = items.slice(0, 6);
    const max = Math.max(...visible.map((item) => item.value), 1);
    const barWidth = width - 125;
    visible.forEach((item, index) => {
        const rowY = y + height - 52 - index * 25;
        const label = item.label.length > 17 ? `${item.label.slice(0, 16)}...` : item.label;
        commands.push(pdfLabel(x + 14, rowY + 4, label, 8));
        commands.push(pdfRect(x + 108, rowY, barWidth, 11, "#E2E8F0"));
        commands.push(pdfRect(x + 108, rowY, Math.max(4, (item.value / max) * barWidth), 11, colorFor(item, index)));
        commands.push(pdfLabel(x + width - 14, rowY + 4, String(item.value), 8, true, "#102A43"));
    });
    if (!visible.length)
        commands.push(pdfLabel(x + 14, y + height - 54, "Sin datos para este corte", 9, false, "#64748B"));
};
const makePdf = (input) => {
    const pages = [];
    const charts = input.charts;
    const summary = input.summary;
    const total = summaryNumber(summary, "totalObservations", input.rows.length);
    const pending = summaryNumber(summary, "pendingObservations", input.rows.length);
    const closed = summaryNumber(summary, "closedObservations", 0);
    const first = [pdfRect(0, 0, 595, 842, "#FFFFFF")];
    first.push(pdfRect(0, 770, 595, 72, "#102A43"), pdfRect(0, 766, 595, 4, "#C62828"));
    first.push(pdfLabel(34, 807, input.reportName, 18, true, "#FFFFFF"));
    first.push(pdfLabel(34, 787, `NIBOL · Generado ${input.generatedAt}`, 8, false, "#D7E0EA"));
    first.push(pdfLabel(34, 744, `Filtros: ${flattenFilters(input.filters).slice(0, 130)}`, 8, false, "#64748B"));
    const cards = [
        ["Total observaciones", total, "#0B7285"],
        ["Pendientes", pending, "#D97706"],
        ["Cerradas", closed, "#16A34A"],
    ];
    cards.forEach(([label, value, color], index) => {
        const x = 34 + index * 177;
        first.push(pdfRect(x, 655, 163, 67, "#F8FAFC"), pdfRect(x, 655, 5, 67, color));
        first.push(pdfLabel(x + 16, 699, label, 8, false, "#64748B"), pdfLabel(x + 16, 671, String(value), 22, true, "#102A43"));
    });
    pdfBarList(first, "Riesgo", charts?.riskDistribution ?? [], 34, 467, 253, 155);
    pdfBarList(first, "Estado de plazo", charts?.deadlineDistribution ?? [], 308, 467, 253, 155);
    pdfBarList(first, "Estado de avance", charts?.progressDistribution ?? [], 34, 279, 253, 155);
    pdfBarList(first, "Distribución por área", charts?.areaDistribution ?? [], 308, 279, 253, 155);
    first.push(pdfLabel(34, 237, "Lectura del corte", 12, true, "#102A43"));
    const insight = summary?.predominantRisk
        ? `Riesgo predominante: ${summary.predominantRisk.label} (${summary.predominantRisk.count}).`
        : input.rows.length
            ? "El corte contiene registros dentro del alcance autorizado."
            : "No hay registros para los filtros seleccionados.";
    first.push(pdfLabel(34, 216, insight, 9, false, "#475569"));
    first.push(pdfLabel(34, 42, "La fuente de KPIs, gráficos, filas y exportación es el mismo corte filtrado.", 8, false, "#64748B"));
    pages.push({ content: first.join("\n"), height: 842, width: 595 });
    const distributionCommands = [pdfRect(0, 0, 595, 842, "#FFFFFF")];
    distributionCommands.push(pdfRect(0, 770, 595, 72, "#102A43"), pdfRect(0, 766, 595, 4, "#C62828"));
    distributionCommands.push(pdfLabel(34, 807, "Distribuciones del corte", 18, true, "#FFFFFF"));
    distributionCommands.push(pdfLabel(34, 787, input.reportName, 8, false, "#D7E0EA"));
    pdfBarList(distributionCommands, "Responsables de área", charts?.areaResponsibleDistribution ?? [], 34, 555, 253, 170);
    pdfBarList(distributionCommands, "Dueños del proceso", charts?.processOwnerDistribution ?? [], 308, 555, 253, 170);
    pdfBarList(distributionCommands, "Ejecutores", charts?.executorDistribution ?? [], 34, 335, 253, 170);
    pdfBarList(distributionCommands, "Reprogramación", charts?.reprogrammedDistribution ?? [], 308, 335, 253, 170);
    pdfBarList(distributionCommands, "Vigencia", charts?.currentVsOverdue ?? [], 34, 115, 253, 170);
    pdfBarList(distributionCommands, "Cumplimiento", charts?.areaPerformance ?? [], 308, 115, 253, 170);
    pages.push({
        content: distributionCommands.join("\n"),
        height: 842,
        width: 595,
    });
    const tableColumns = input.columns.slice(0, 8);
    const rowsPerPage = 27;
    for (let start = 0; start < Math.max(1, input.rows.length); start += rowsPerPage) {
        const commands = [pdfRect(0, 0, 842, 595, "#FFFFFF")];
        commands.push(pdfRect(0, 523, 842, 72, "#102A43"), pdfRect(0, 519, 842, 4, "#C62828"));
        commands.push(pdfLabel(28, 560, `${input.reportName} · Registros`, 15, true, "#FFFFFF"));
        commands.push(pdfLabel(28, 540, `Página de datos · ${start + 1}-${Math.min(start + rowsPerPage, input.rows.length)} de ${input.rows.length}`, 8, false, "#D7E0EA"));
        const colWidth = 786 / Math.max(tableColumns.length, 1);
        tableColumns.forEach((column, index) => {
            const x = 28 + index * colWidth;
            commands.push(pdfRect(x, 486, colWidth, 24, "#E9F0F7"), pdfLabel(x + 4, 494, column.slice(0, 19), 6.5, true, "#102A43"));
        });
        input.rows.slice(start, start + rowsPerPage).forEach((row, rowIndex) => {
            const y = 465 - rowIndex * 16;
            if (rowIndex % 2 === 1)
                commands.push(pdfRect(28, y - 4, 786, 16, "#F8FAFC"));
            tableColumns.forEach((column, index) => {
                const value = stringifyCell(row[column]).replaceAll("\n", " ");
                commands.push(pdfLabel(32 + index * colWidth, y, value.slice(0, 27), 6.2, false, "#334155"));
            });
        });
        commands.push(pdfLabel(28, 28, "Para detalle completo, consulte el archivo Excel.", 8, false, "#64748B"));
        pages.push({ content: commands.join("\n"), height: 595, width: 842 });
    }
    const objects = [];
    const pageIds = [];
    let nextId = 5;
    pages.forEach((page) => {
        const contentId = nextId++;
        const pageId = nextId++;
        const content = page.content;
        objects[contentId] =
            `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream\nendobj\n`;
        objects[pageId] =
            `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`;
        pageIds.push(pageId);
    });
    objects[1] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
    objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>\nendobj\n`;
    objects[3] =
        "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n";
    objects[4] =
        "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n";
    let pdf = "%PDF-1.4\n";
    const offsets = [];
    for (let id = 1; id < objects.length; id += 1) {
        offsets[id] = Buffer.byteLength(pdf, "latin1");
        pdf += objects[id] ?? "";
    }
    const xrefOffset = Buffer.byteLength(pdf, "latin1");
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id += 1)
        pdf += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, "latin1");
};
export const buildReportPdf = (input) => makePdf(input);
export const buildSimplePdf = (input) => makePdf(input);
//# sourceMappingURL=reports.exports.js.map