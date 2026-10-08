"""Read the five historical XLSX sheets with Python's standard library."""

import json
import re
import sys
from datetime import datetime, timedelta
from xml.etree import ElementTree as ET
from zipfile import ZipFile

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN}
WANTED = {
    "Detalle de obs. y planes",
    "Riesgos asociados",
    "Usuarios",
    "BD-Observaciones",
    "BD-Informes Auditoría",
}
DATE_HEADERS = {
    "Fecha de informe",
    "Fecha compromiso (vencimiento)",
    "Fecha compromiso (plan de acción)",
    "Fecha reprogramación",
    "Fecha",
}


def cells(row, strings):
    result = {}
    for cell in row.findall(f"{{{MAIN}}}c"):
        column = re.match(r"[A-Z]+", cell.get("r", ""))
        if not column:
            continue
        value = cell.find(f"{{{MAIN}}}v")
        inline = cell.find(f"{{{MAIN}}}is")
        raw = value.text if value is not None else ""
        if cell.get("t") == "s" and raw:
            raw = strings[int(raw)]
        elif inline is not None:
            raw = "".join(node.text or "" for node in inline.findall(f".//{{{MAIN}}}t"))
        result[column.group()] = raw or ""
    return result


def read(path):
    with ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = [
                "".join(node.text or "" for node in item.findall(f".//{{{MAIN}}}t"))
                for item in root.findall(f"{{{MAIN}}}si")
            ]
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {item.get("Id"): item.get("Target") for item in relationships.findall(f"{{{PKG}}}Relationship")}
        result = {}
        for sheet in workbook.findall(f".//{{{MAIN}}}sheet"):
            name = sheet.get("name")
            if name not in WANTED:
                continue
            target = targets[sheet.get(f"{{{REL}}}id")]
            member = target.lstrip("/") if target.startswith("/") else "xl/" + target
            root = ET.fromstring(archive.read(member))
            rows = root.findall(f".//{{{MAIN}}}sheetData/{{{MAIN}}}row")
            header_number = 2 if name == "Detalle de obs. y planes" else 1
            header = next(cells(row, strings) for row in rows if int(row.get("r")) == header_number)
            output = []
            for row in rows:
                number = int(row.get("r"))
                if number <= header_number:
                    continue
                values = cells(row, strings)
                item = {"_row": number}
                for column, label in header.items():
                    key = label.strip()
                    if not key:
                        continue
                    value = values.get(column, "")
                    if key not in {"Comentario 1", "Comentario 2"}:
                        value = value.strip()
                    if value and key in DATE_HEADERS and re.fullmatch(r"\d+(?:\.\d+)?", value):
                        value = (datetime(1899, 12, 30) + timedelta(days=float(value))).date().isoformat()
                    item[key] = value
                if any(value for key, value in item.items() if key != "_row"):
                    output.append(item)
            result[name] = output
        missing = WANTED - result.keys()
        if missing:
            raise ValueError(f"Missing historical sheets: {sorted(missing)}")
        return result


if __name__ == "__main__":
    json.dump(read(sys.argv[1]), sys.stdout, ensure_ascii=False)
