import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

const MAX_BYTES = 5 * 1024 * 1024;

export type MultipartFile = {
  fieldName: string;
  filename: string;
  mimeType: string;
  data: Buffer;
};

export async function readMultipart(req: Request): Promise<{
  fields: Record<string, string>;
  files: MultipartFile[];
}> {
  const contentType = req.headers['content-type'];
  if (!contentType?.includes('multipart/form-data')) {
    throw new BadRequestException('Expected multipart form data');
  }
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = (match?.[1] ?? match?.[2])?.trim();
  if (!boundary) {
    throw new BadRequestException('Missing multipart boundary');
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > MAX_BYTES + 64 * 1024) {
      throw new BadRequestException('Upload is too large');
    }
    chunks.push(buf);
  }
  return parseMultipart(Buffer.concat(chunks), boundary);
}

function parseMultipart(
  body: Buffer,
  boundary: string,
): { fields: Record<string, string>; files: MultipartFile[] } {
  const delimiter = Buffer.from(`--${boundary}`);
  const fields: Record<string, string> = {};
  const files: MultipartFile[] = [];
  let cursor = body.indexOf(delimiter);
  if (cursor < 0) {
    throw new BadRequestException('Malformed multipart body');
  }
  cursor += delimiter.length;

  while (cursor < body.length) {
    if (body.subarray(cursor, cursor + 2).toString() === '--') {
      break;
    }
    if (body.subarray(cursor, cursor + 2).toString() === '\r\n') {
      cursor += 2;
    }
    const headerEnd = body.indexOf('\r\n\r\n', cursor);
    if (headerEnd < 0) {
      break;
    }
    const headerText = body.subarray(cursor, headerEnd).toString('utf8');
    const dataStart = headerEnd + 4;
    const next = body.indexOf(delimiter, dataStart);
    if (next < 0) {
      break;
    }
    let dataEnd = next;
    if (body.subarray(dataEnd - 2, dataEnd).toString() === '\r\n') {
      dataEnd -= 2;
    }
    const data = body.subarray(dataStart, dataEnd);
    const name = /name="([^"]+)"/.exec(headerText)?.[1];
    const filename = /filename="([^"]*)"/.exec(headerText)?.[1];
    const mime =
      /content-type:\s*([^\r\n]+)/i.exec(headerText)?.[1]?.trim() ??
      'application/octet-stream';
    if (name && filename !== undefined && filename.length > 0) {
      files.push({
        fieldName: name,
        filename,
        mimeType: mime,
        data,
      });
    } else if (name) {
      fields[name] = data.toString('utf8');
    }
    cursor = next + delimiter.length;
  }

  return { fields, files };
}
