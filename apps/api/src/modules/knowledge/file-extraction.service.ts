import { Injectable, BadRequestException } from '@nestjs/common';

// pdf-parse v2 and mammoth ship as CJS with no default-export-friendly types
// under NodeNext — requiring them keeps the call sites simple.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PDFParse } = require('pdf-parse');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mammoth = require('mammoth');

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — plain text extracted from
// this is what actually gets embedded, no reason to accept more.

/** Extracts plain text from an uploaded file so it can become a knowledge
 * entry's `content`. PDF and DOCX carry real documents (scripts, FAQs,
 * policies) customers already have lying around — this is what makes
 * "just upload the file" possible instead of copy-pasting into a textarea. */
@Injectable()
export class FileExtractionService {
  async extractText(file: Express.Multer.File): Promise<string> {
    if (file.size > MAX_FILE_BYTES) {
      throw new BadRequestException('File is too large (max 10MB)');
    }

    const ext = (file.originalname.split('.').pop() ?? '').toLowerCase();

    switch (ext) {
      case 'txt':
      case 'md':
        return file.buffer.toString('utf-8');

      case 'pdf': {
        const parser = new PDFParse({ data: file.buffer });
        const result = await parser.getText();
        // pdf-parse inserts "-- N of M --" page separators — noise for a
        // knowledge entry that reads as one continuous document.
        const text = (result.text as string)
          .replace(/--\s*\d+\s*of\s*\d+\s*--/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        if (!text) {
          throw new BadRequestException(
            'Could not extract any text from this PDF — it may be a scanned image with no text layer',
          );
        }
        return text;
      }

      case 'docx': {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        const text = (result.value as string).trim();
        if (!text) {
          throw new BadRequestException('Could not extract any text from this document');
        }
        return text;
      }

      default:
        throw new BadRequestException(
          `Unsupported file type ".${ext}" — accepted: .txt, .md, .pdf, .docx`,
        );
    }
  }

  /** Filename minus extension, for a sane default title. */
  titleFromFilename(originalname: string): string {
    const withoutExt = originalname.replace(/\.[^/.]+$/, '');
    return withoutExt.replace(/[_-]+/g, ' ').trim() || originalname;
  }
}
