import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, encryptJson, decryptJson } from './envelope';
import { pad, unpad } from './padding';
import { deriveKey, createKdfParams } from './derive';
import { makeVerifier, checkVerifier } from './verifier';
import { assessPassphrase, generatePassphrase } from './strength';
import { toBase64, fromBase64, encodeUtf8, decodeUtf8 } from '@/utils/encoding';

/**
 * Crypto tests.
 *
 * These exist because the encryption layer is the one place where a silent
 * regression is genuinely dangerous: a bug that makes messages *readable*
 * looks identical, from the UI, to one that doesn't. Everything else in the
 * app fails visibly.
 *
 * The properties asserted here are the ones the design actually depends on —
 * IV uniqueness, authenticated failure, length hiding — rather than
 * line coverage for its own sake.
 */

async function testKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

describe('envelope', () => {
  it('round-trips bytes', async () => {
    const key = await testKey();
    const plaintext = encodeUtf8('hello world');
    const sealed = await encrypt(key, plaintext);
    expect(decodeUtf8(await decrypt(key, sealed))).toBe('hello world');
  });

  it('round-trips non-ASCII and emoji', async () => {
    const key = await testKey();
    for (const text of ['नमस्ते दोस्त', '🔒 emoji 🎉', 'çöğüş']) {
      const sealed = await encrypt(key, encodeUtf8(text));
      expect(decodeUtf8(await decrypt(key, sealed))).toBe(text);
    }
  });

  it('uses a unique IV for every encryption', async () => {
    const key = await testKey();
    const plaintext = encodeUtf8('same message every time');

    const ivs = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      ivs.add((await encrypt(key, plaintext)).iv);
    }
    // IV reuse under a fixed key breaks GCM catastrophically — it leaks the
    // XOR of plaintexts and enables forgery. This is the single most important
    // assertion in the file.
    expect(ivs.size).toBe(500);
  });

  it('produces a 12-byte IV', async () => {
    const key = await testKey();
    const sealed = await encrypt(key, encodeUtf8('x'));
    expect(fromBase64(sealed.iv).length).toBe(12);
  });

  it('rejects the wrong key', async () => {
    const sealed = await encrypt(await testKey(), encodeUtf8('secret'));
    await expect(decrypt(await testKey(), sealed)).rejects.toThrow();
  });

  it('rejects tampered ciphertext', async () => {
    const key = await testKey();
    const sealed = await encrypt(key, encodeUtf8('secret'));

    const bytes = fromBase64(sealed.ct);
    bytes[0] = (bytes[0] ?? 0) ^ 1;

    await expect(decrypt(key, { ...sealed, ct: toBase64(bytes) })).rejects.toThrow();
  });

  it('rejects a tampered IV', async () => {
    const key = await testKey();
    const sealed = await encrypt(key, encodeUtf8('secret'));

    const iv = fromBase64(sealed.iv);
    iv[0] = (iv[0] ?? 0) ^ 1;

    await expect(decrypt(key, { ...sealed, iv: toBase64(iv) })).rejects.toThrow();
  });

  it('rejects an unknown envelope version', async () => {
    const key = await testKey();
    const sealed = await encrypt(key, encodeUtf8('x'));
    await expect(decrypt(key, { ...sealed, v: 2 as 1 })).rejects.toThrow();
  });

  it('round-trips JSON', async () => {
    const key = await testKey();
    const value = { kind: 'text', text: 'hi', nested: { list: [1, 2, 3] } };
    expect(await decryptJson(key, await encryptJson(key, value))).toEqual(value);
  });
});

describe('padding', () => {
  it('round-trips', () => {
    for (const text of ['', 'ok', 'a longer message with spaces', '🔥'.repeat(50)]) {
      expect(unpad(pad(text))).toBe(text);
    }
  });

  it('hides length within a bucket', () => {
    // The whole point: "ok" and a confession must be indistinguishable by size.
    expect(pad('ok').length).toBe(pad('I am leaving you').length);
  });

  it('uses larger buckets for longer text', () => {
    expect(pad('x'.repeat(2000)).length).toBeGreaterThan(pad('ok').length);
  });

  it('refuses text that exceeds the largest bucket', () => {
    expect(() => pad('x'.repeat(5000))).toThrow();
  });

  it('rejects a corrupted length header', () => {
    const padded = pad('hello');
    // Claim a length longer than the buffer.
    new DataView(padded.buffer).setUint32(0, 99_999, false);
    expect(() => unpad(padded)).toThrow();
  });
});

describe('key derivation and verifier', () => {
  it('derives the same key from the same passphrase and salt', async () => {
    const params = createKdfParams();
    const a = await deriveKey('correct horse battery staple', params);
    const b = await deriveKey('correct horse battery staple', params);

    // Keys are non-extractable, so equality is proven by cross-decryption.
    const sealed = await encrypt(a, encodeUtf8('proof'));
    expect(decodeUtf8(await decrypt(b, sealed))).toBe('proof');
  });

  it('derives different keys from different salts', async () => {
    const a = await deriveKey('same passphrase here', createKdfParams());
    const b = await deriveKey('same passphrase here', createKdfParams());
    await expect(decrypt(b, await encrypt(a, encodeUtf8('x')))).rejects.toThrow();
  });

  it('accepts the correct passphrase and rejects a wrong one', async () => {
    const params = createKdfParams();
    const key = await deriveKey('the real passphrase', params);
    const verifier = await makeVerifier(key);

    expect(await checkVerifier(key, verifier)).toBe(true);
    expect(await checkVerifier(await deriveKey('wrong passphrase', params), verifier)).toBe(false);
  });

  it('refuses weakened iteration counts', async () => {
    const params = { ...createKdfParams(), iterations: 1000 };
    // A tampered kdf document must not be able to make derivation cheap.
    await expect(deriveKey('anything', params)).rejects.toThrow();
  });

  it('generates a fresh salt each time', () => {
    expect(createKdfParams().salt).not.toBe(createKdfParams().salt);
  });
});

describe('passphrase strength', () => {
  it('rejects anything under the minimum length', () => {
    expect(assessPassphrase('short').acceptable).toBe(false);
  });

  it('rejects common passwords and repetition', () => {
    expect(assessPassphrase('password').acceptable).toBe(false);
    expect(assessPassphrase('aaaaaaaaaaaaaa').acceptable).toBe(false);
    expect(assessPassphrase('abcabcabcabcabc').acceptable).toBe(false);
  });

  it('rates a long generated phrase as strong', () => {
    expect(assessPassphrase(generatePassphrase()).level).toBe('strong');
  });

  it('generates a different passphrase each time', () => {
    expect(generatePassphrase()).not.toBe(generatePassphrase());
  });
});

describe('encoding', () => {
  it('round-trips base64url', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(1000));
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('emits url-safe output with no padding', () => {
    const encoded = toBase64(crypto.getRandomValues(new Uint8Array(300)));
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('handles large buffers without blowing the argument limit', () => {
    // toBase64 chunks its input at 0x8000 bytes because String.fromCharCode
    // has an argument limit. A 200 KB image would break a naive version.
    //
    // Filled in 64 KB chunks because crypto.getRandomValues itself refuses
    // more than 65,536 bytes per call — a different limit, in the test's own
    // setup rather than in the code under test.
    const bytes = new Uint8Array(200_000);
    for (let offset = 0; offset < bytes.length; offset += 65_536) {
      crypto.getRandomValues(bytes.subarray(offset, Math.min(offset + 65_536, bytes.length)));
    }

    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});
