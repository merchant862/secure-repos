type SheetRow = Array<string | number | boolean | null | undefined | Date>;

type WorkbookSheet = {
    name: string;
    rows: SheetRow[];
};

const crcTable = new Uint32Array(256);

for (let index = 0; index < 256; index += 1)
{
    let value = index;

    for (let bit = 0; bit < 8; bit += 1)
    {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    crcTable[index] = value >>> 0;
}

function crc32(buffer: Buffer)
{
    let crc = 0xffffffff;

    for (const byte of buffer)
    {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
}

function xmlEscape(value: unknown)
{
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function columnName(index: number)
{
    let name = '';
    let column = index + 1;

    while (column > 0)
    {
        const remainder = (column - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        column = Math.floor((column - remainder) / 26);
    }

    return name;
}

function cellXml(value: SheetRow[number], rowIndex: number, columnIndex: number)
{
    const ref = `${columnName(columnIndex)}${rowIndex + 1}`;

    if (typeof value === 'number' && Number.isFinite(value))
    {
        return `<c r="${ref}"><v>${value}</v></c>`;
    }

    if (typeof value === 'boolean')
    {
        return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
    }

    const normalized = value instanceof Date ? value.toISOString() : value ?? '';

    return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(normalized)}</t></is></c>`;
}

function worksheetXml(rows: SheetRow[])
{
    const body = rows.map(function (row, rowIndex)
    {
        const cells = row.map(function (value, columnIndex)
        {
            return cellXml(value, rowIndex, columnIndex);
        }).join('');

        return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function localFileHeader(name: string, content: Buffer)
{
    const nameBuffer = Buffer.from(name);
    const header = Buffer.alloc(30);
    const crc = crc32(content);

    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(content.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(nameBuffer.length, 26);
    header.writeUInt16LE(0, 28);

    return { buffer: Buffer.concat([header, nameBuffer, content]), crc };
}

function centralDirectoryHeader(name: string, content: Buffer, crc: number, offset: number)
{
    const nameBuffer = Buffer.from(name);
    const header = Buffer.alloc(46);

    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(content.length, 20);
    header.writeUInt32LE(content.length, 24);
    header.writeUInt16LE(nameBuffer.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset, 42);

    return Buffer.concat([header, nameBuffer]);
}

function endOfCentralDirectory(fileCount: number, centralDirectorySize: number, centralDirectoryOffset: number)
{
    const footer = Buffer.alloc(22);

    footer.writeUInt32LE(0x06054b50, 0);
    footer.writeUInt16LE(0, 4);
    footer.writeUInt16LE(0, 6);
    footer.writeUInt16LE(fileCount, 8);
    footer.writeUInt16LE(fileCount, 10);
    footer.writeUInt32LE(centralDirectorySize, 12);
    footer.writeUInt32LE(centralDirectoryOffset, 16);
    footer.writeUInt16LE(0, 20);

    return footer;
}

function buildXlsxWorkbook(sheets: WorkbookSheet[])
{
    const files = new Map<string, string>();
    const sheetEntries = sheets.map(function (sheet, index)
    {
        const id = index + 1;

        files.set(`xl/worksheets/sheet${id}.xml`, worksheetXml(sheet.rows));

        return { id, name: sheet.name.slice(0, 31) || `Sheet ${id}` };
    });

    files.set(
        '[Content_Types].xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetEntries.map((sheet) => `<Override PartName="/xl/worksheets/sheet${sheet.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`
    );
    files.set(
        '_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
    );
    files.set(
        'xl/workbook.xml',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries.map((sheet) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${sheet.id}" r:id="rId${sheet.id}"/>`).join('')}</sheets></workbook>`
    );
    files.set(
        'xl/_rels/workbook.xml.rels',
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetEntries.map((sheet) => `<Relationship Id="rId${sheet.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${sheet.id}.xml"/>`).join('')}</Relationships>`
    );

    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const [name, xml] of files)
    {
        const content = Buffer.from(xml);
        const local = localFileHeader(name, content);

        localParts.push(local.buffer);
        centralParts.push(centralDirectoryHeader(name, content, local.crc, offset));
        offset += local.buffer.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const footer = endOfCentralDirectory(files.size, centralDirectory.length, offset);

    return Buffer.concat([...localParts, centralDirectory, footer]);
}

export {
    buildXlsxWorkbook,
    WorkbookSheet
};
