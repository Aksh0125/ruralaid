/**
 * Reads the duration of an MP4/MOV video buffer in seconds.
 * Extracts the duration by parsing the 'mvhd' (Movie Header) atom.
 * Returns -1 if the duration metadata is not found or invalid.
 */
export function getMp4Duration(buffer: Buffer): number {
  const mvhdOffset = buffer.indexOf(Buffer.from('mvhd'));
  if (mvhdOffset === -1) {
    return -1;
  }

  try {
    // mvhd offset points to the 'mvhd' string.
    // Box structure:
    // [4 bytes size][4 bytes 'mvhd'][1 byte version][3 bytes flags]
    // The version field is at offset + 4 bytes.
    const version = buffer.readUInt8(mvhdOffset + 4);

    let timeScale: number;
    let duration: number;

    if (version === 1) {
      // Version 1 uses 64-bit ints (8 bytes) for timestamps and duration.
      // Offset layout after version/flags (4 bytes):
      // - Creation time: 8 bytes
      // - Modification time: 8 bytes
      // - Time scale: 4 bytes (starts at offset 20)
      // - Duration: 8 bytes (starts at offset 24)
      timeScale = buffer.readUInt32BE(mvhdOffset + 20);
      
      const durationHigh = buffer.readUInt32BE(mvhdOffset + 24);
      const durationLow = buffer.readUInt32BE(mvhdOffset + 28);
      duration = durationHigh * 4294967296 + durationLow;
    } else {
      // Version 0 uses 32-bit ints (4 bytes) for timestamps and duration.
      // Offset layout after version/flags (4 bytes):
      // - Creation time: 4 bytes
      // - Modification time: 4 bytes
      // - Time scale: 4 bytes (starts at offset 12)
      // - Duration: 4 bytes (starts at offset 16)
      timeScale = buffer.readUInt32BE(mvhdOffset + 12);
      duration = buffer.readUInt32BE(mvhdOffset + 16);
    }

    if (timeScale === 0) return -1;
    return duration / timeScale;
  } catch (err) {
    console.error('[Video Duration Parser Error]', err);
    return -1;
  }
}
