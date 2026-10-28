/** Just enough of a Standard MIDI File reader to check what the app writes. */
export function readMidi(bytes: Uint8Array) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tpq = dv.getUint16(12);
  let i = 22;
  let tick = 0;
  const notes: { tick: number; midi: number; on: boolean; vel: number }[] = [];
  let tempo = 0;
  let name = '';
  const vlq = () => { let n = 0; let b; do { b = bytes[i++]; n = (n << 7) | (b & 0x7f); } while (b & 0x80); return n; };
  while (i < bytes.length) {
    tick += vlq();
    const status = bytes[i++];
    if (status === 0xff) {
      const type = bytes[i++];
      const len = vlq();
      if (type === 0x51) tempo = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      if (type === 0x03) name = new TextDecoder().decode(bytes.slice(i, i + len));
      i += len;
      if (type === 0x2f) break;
    } else {
      const midi = bytes[i++];
      const vel = bytes[i++];
      notes.push({ tick, midi, on: (status & 0xf0) === 0x90 && vel > 0, vel });
    }
  }
  return { tpq, tempo, name, notes };
}
