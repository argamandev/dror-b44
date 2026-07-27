// What the ChatBar's + will actually accept into private storage. Pure, and
// deliberately separate from docs.ts (which pulls in the SDK client): the
// picker's `accept` attribute is advisory — Android and desktop both offer an
// "All files" escape next to it — so this is the real gate, not the input
// element (review round 1, Important 2).

/** 20MB: comfortably above a photographed multi-page referral, far below an archive. */
export const MAX_DOC_BYTES = 20 * 1024 * 1024;

export type DocFileRejection = 'type' | 'size' | 'empty';

/** Extensions we trust when the picker reports no MIME type at all. */
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.gif'];

interface PickedFile {
  name: string;
  type: string;
  size: number;
}

function isAllowedType(file: PickedFile): boolean {
  if (file.type === 'application/pdf' || file.type.startsWith('image/')) return true;
  // Some pickers hand back an empty type; the extension is all we have left.
  if (file.type) return false;
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/** null when the file may be uploaded; otherwise why it was refused. */
export function checkDocFile(file: PickedFile): DocFileRejection | null {
  if (!isAllowedType(file)) return 'type';
  if (file.size <= 0) return 'empty';
  if (file.size > MAX_DOC_BYTES) return 'size';
  return null;
}
