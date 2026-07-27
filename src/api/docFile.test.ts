import { describe, it, expect } from 'vitest';
import { checkDocFile, MAX_DOC_BYTES } from './docFile';

// The picker's `accept` attribute is advisory only — Android and desktop both
// offer "All files" next to it — so this predicate, not the input, is what
// keeps a .mov or a 300MB archive out of private storage (review round 1,
// Important 2).
const f = (name: string, type: string, size = 1024) => ({ name, type, size });

describe('checkDocFile', () => {
  it('accepts a PDF', () => {
    expect(checkDocFile(f('הפניה.pdf', 'application/pdf'))).toBe(null);
  });

  it('accepts photographed documents of any image type', () => {
    expect(checkDocFile(f('doc.jpg', 'image/jpeg'))).toBe(null);
    expect(checkDocFile(f('doc.png', 'image/png'))).toBe(null);
    expect(checkDocFile(f('doc.heic', 'image/heic'))).toBe(null);
  });

  it('rejects anything else by type', () => {
    expect(checkDocFile(f('session.mov', 'video/quicktime'))).toBe('type');
    expect(checkDocFile(f('archive.zip', 'application/zip'))).toBe('type');
    expect(checkDocFile(f('notes.txt', 'text/plain'))).toBe('type');
  });

  it('falls back to the extension when the picker reports no MIME type', () => {
    // Real Android/desktop pickers hand back type: '' for some files.
    expect(checkDocFile(f('הפניה.PDF', ''))).toBe(null);
    expect(checkDocFile(f('scan.jpeg', ''))).toBe(null);
    expect(checkDocFile(f('archive.zip', ''))).toBe('type');
    expect(checkDocFile(f('noextension', ''))).toBe('type');
  });

  it('accepts a file exactly at the size ceiling', () => {
    expect(checkDocFile(f('big.pdf', 'application/pdf', MAX_DOC_BYTES))).toBe(null);
  });

  it('rejects a file over the size ceiling', () => {
    expect(checkDocFile(f('big.pdf', 'application/pdf', MAX_DOC_BYTES + 1))).toBe('size');
  });

  it('reports the wrong type first when a file is both too big and unsupported', () => {
    expect(checkDocFile(f('huge.mov', 'video/quicktime', MAX_DOC_BYTES * 10))).toBe('type');
  });

  it('rejects an empty file', () => {
    // A 0-byte pick is a failed read, not a document — uploading it would
    // store nothing and then "fail to read" confusingly.
    expect(checkDocFile(f('empty.pdf', 'application/pdf', 0))).toBe('empty');
  });
});
