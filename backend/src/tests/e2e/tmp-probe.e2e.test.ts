import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import multer from 'multer';
import { errorHandler } from '../../middlewares/error';

function build() {
  const a = express();
  const captureRawBody = (req: any, _res: any, buf: Buffer) => { req.rawBody = buf; };
  a.use(express.json({ limit: '10mb', verify: captureRawBody }));
  a.use(express.urlencoded({ extended: true, verify: captureRawBody }));
  const up = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 3 } });
  a.post('/up', up.array('receipts', 3), (req, res) => {
    res.json({ files: (req.files as any[])?.length ?? 0, body: req.body, ct: req.headers['content-type'] });
  });
  a.use(errorHandler);
  return a;
}

function rawMultipart(): string {
  const b = '----probeboundary123';
  return [
    `--${b}`,
    'Content-Disposition: form-data; name="proofCardLast4"',
    '',
    '1234',
    `--${b}`,
    'Content-Disposition: form-data; name="proofCardholderName"',
    '',
    'Sardor Alimov',
    `--${b}`,
    'Content-Disposition: form-data; name="receipts"; filename="a.png"',
    'Content-Type: image/png',
    '',
    'PNGDATA',
    `--${b}--`,
    '',
  ].join('\r\n');
}

describe('PROBE 2: axios default Content-Type application/json + multipart body', () => {
  it('D) correct multipart (supertest .attach)', async () => {
    const res = await request(build()).post('/up')
      .attach('receipts', Buffer.from('x'), { filename: 'a.png', contentType: 'image/png' })
      .field('proofCardLast4', '1234');
    console.log('D)', res.status, JSON.stringify(res.body));
  });

  it('E) Content-Type: application/json, multipart body -> express.json consumes stream', async () => {
    const res = await request(build()).post('/up')
      .set('Content-Type', 'application/json')
      .send(rawMultipart());
    console.log('E)', res.status, JSON.stringify(res.body));
  });

  it('F) Content-Type: multipart/form-data (no boundary) -> express.json skips, multer fails', async () => {
    const res = await request(build()).post('/up')
      .set('Content-Type', 'multipart/form-data')
      .send(rawMultipart());
    console.log('F)', res.status, JSON.stringify(res.body));
  });
});
