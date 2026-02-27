'use strict';

/**
 * payloadMutator.js
 * Applies various obfuscation and encoding mutations to payloads
 * to test proxy bypass detection capabilities.
 */

// ---------------------------------------------------------------------------
// Homoglyph lookup table (Latin → visually similar Unicode characters)
// ---------------------------------------------------------------------------
const HOMOGLYPH_MAP = {
  'a': ['а', 'ạ', 'ă', 'ā', 'ä', 'à', 'á', 'â', 'ã', 'å'],  // Cyrillic а, Latin variants
  'b': ['ƅ', 'Ь', 'ɓ'],
  'c': ['с', 'ϲ', 'ċ', 'ć'],                                   // Cyrillic с
  'd': ['ԁ', 'ɗ', 'đ'],
  'e': ['е', 'ė', 'ę', 'ē', 'ě'],                              // Cyrillic е
  'f': ['ƒ'],
  'g': ['ɡ', 'ġ', 'ģ'],
  'h': ['һ', 'ħ'],                                              // Cyrillic
  'i': ['і', 'ı', 'ï', 'ì', 'í', 'î'],                        // Cyrillic і
  'j': ['ϳ', 'ĵ'],
  'k': ['κ', 'ķ'],
  'l': ['ӏ', 'ļ', 'ĺ', 'ľ'],                                   // Cyrillic ӏ
  'm': ['м', 'ṁ'],                                              // Cyrillic м
  'n': ['п', 'ń', 'ñ', 'ņ'],
  'o': ['о', 'ο', 'ỏ', 'ö', 'ò', 'ó', 'ô', 'õ', 'ø'],        // Cyrillic о, Greek ο
  'p': ['р', 'ṗ'],                                              // Cyrillic р
  'q': ['ԛ'],
  'r': ['г', 'ŕ', 'ř'],                                         // Cyrillic г (sometimes)
  's': ['ѕ', 'ś', 'ş', 'š'],                                   // Cyrillic ѕ
  't': ['т', 'ţ', 'ť'],                                         // Cyrillic т
  'u': ['υ', 'ü', 'ù', 'ú', 'û', 'ū'],                        // Greek υ
  'v': ['ν', 'ṽ'],
  'w': ['ω', 'ŵ'],                                              // Greek ω
  'x': ['х', 'χ'],                                              // Cyrillic х, Greek χ
  'y': ['у', 'ý', 'ÿ'],                                         // Cyrillic у
  'z': ['ż', 'ź', 'ž'],
  'A': ['А', 'Å', 'Ä'],
  'B': ['В', 'Β'],
  'C': ['С', 'Ϲ'],
  'D': ['Ð'],
  'E': ['Е', 'Ε'],
  'H': ['Н', 'Η'],
  'I': ['І', 'Ι'],
  'J': ['Ϳ'],
  'K': ['Κ'],
  'M': ['М', 'Μ'],
  'N': ['Ν'],
  'O': ['О', 'Ο', 'Ö'],
  'P': ['Р', 'Ρ'],
  'S': ['Ѕ'],
  'T': ['Т', 'Τ'],
  'X': ['Х', 'Χ'],
  'Y': ['У', 'Υ'],
  'Z': ['Ζ'],
  '0': ['О', 'о', 'Ο', 'ο'],
  '1': ['І', 'l', '|'],
  '3': ['Ε', 'З'],
  '4': ['Ч'],
  '5': ['Ƽ'],
  '6': ['б'],
  '9': ['q'],
};

// Zero-width characters commonly used for steganographic injection
const ZERO_WIDTH_CHARS = [
  '\u200B', // Zero Width Space
  '\u200C', // Zero Width Non-Joiner
  '\u200D', // Zero Width Joiner
  '\u2060', // Word Joiner
  '\uFEFF', // Zero Width No-Break Space (BOM)
  '\u00AD', // Soft Hyphen
  '\u034F', // Combining Grapheme Joiner
  '\u180E', // Mongolian Vowel Separator
];

// ---------------------------------------------------------------------------
// Core mutation functions
// ---------------------------------------------------------------------------

/**
 * Base64-encode the payload. Optionally wrap with a prefix to signal encoding.
 */
function encodeBase64(text, prefix = '') {
  const encoded = Buffer.from(text, 'utf8').toString('base64');
  return prefix ? `${prefix}${encoded}` : encoded;
}

/**
 * Decode base64 payload (utility for test verification).
 */
function decodeBase64(text) {
  try {
    return Buffer.from(text, 'base64').toString('utf8');
  } catch (_) {
    return text;
  }
}

/**
 * Insert zero-width characters between every N characters of the text.
 */
function insertZeroWidthChars(text, frequency = 3) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += text[i];
    if ((i + 1) % frequency === 0 && i < text.length - 1) {
      // Pick a pseudo-random zero-width char
      result += ZERO_WIDTH_CHARS[i % ZERO_WIDTH_CHARS.length];
    }
  }
  return result;
}

/**
 * Replace alphabetic and numeric characters with homoglyphs.
 * Replacement probability controls aggressiveness.
 */
function applyHomoglyphs(text, probability = 0.4) {
  let result = '';
  for (const char of text) {
    const alternatives = HOMOGLYPH_MAP[char];
    if (alternatives && Math.random() < probability) {
      result += alternatives[Math.floor(Math.random() * alternatives.length)];
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Generate an obfuscated SSN with various formatting variants.
 */
function obfuscateSSN(ssn) {
  const digits = ssn.replace(/\D/g, '');
  if (digits.length !== 9) return ssn;

  const variants = [
    // Standard with spaces instead of dashes
    `${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`,
    // Dot-separated
    `${digits.slice(0, 3)}.${digits.slice(3, 5)}.${digits.slice(5)}`,
    // No separator
    digits,
    // Unicode en-dashes
    `${digits.slice(0, 3)}\u2013${digits.slice(3, 5)}\u2013${digits.slice(5)}`,
    // Mixed with zero-width chars
    `${digits.slice(0, 3)}\u200B-${digits.slice(3, 5)}\u200B-${digits.slice(5)}`,
    // Surrounded by whitespace variants
    `${digits.slice(0, 3)}\u00A0${digits.slice(3, 5)}\u00A0${digits.slice(5)}`,
  ];

  return variants[Math.floor(Math.random() * variants.length)];
}

/**
 * Randomize the casing of alphabetic characters.
 */
function randomizeCase(text) {
  return Array.from(text).map((char) => {
    if (/[a-zA-Z]/.test(char)) {
      return Math.random() > 0.5 ? char.toUpperCase() : char.toLowerCase();
    }
    return char;
  }).join('');
}

/**
 * Unicode normalization bypass: use decomposed/composed forms.
 */
function unicodeNormalizationObfuscate(text) {
  // NFC -> NFD -> back to string creates visually identical but byte-different text
  const nfd = text.normalize('NFD');
  // Insert combining characters to confuse pattern matchers
  let result = '';
  for (const char of nfd) {
    result += char;
    // Occasionally insert combining diacritical marks
    if (/[a-zA-Z]/.test(char) && Math.random() < 0.2) {
      result += '\u0301'; // Combining acute accent
    }
  }
  return result;
}

/**
 * URL-encode the payload (for HTTP parameter smuggling tests).
 */
function urlEncode(text) {
  return encodeURIComponent(text);
}

/**
 * Hex-encode the payload.
 */
function hexEncode(text) {
  return Buffer.from(text, 'utf8').toString('hex');
}

/**
 * Apply ROT13 to alphabetic characters only.
 */
function rot13(text) {
  return text.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= 'Z' ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/**
 * Split the payload into chunks with separator characters between them.
 */
function chunkSplit(text, chunkSize = 5, separator = '\n') {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks.join(separator);
}

/**
 * Wrap text in a multi-language prompt to obscure intent.
 */
function linguisticWrap(text) {
  const prefixes = [
    'Please translate the following to Spanish: ',
    'Summarize this text: ',
    'What is the meaning of: ',
    'Fix the following JSON: {"data": "',
    'Decode this message: ',
  ];
  const suffixes = ['', '', '', '"}', ''];
  const idx = Math.floor(Math.random() * prefixes.length);
  return `${prefixes[idx]}${text}${suffixes[idx]}`;
}

// ---------------------------------------------------------------------------
// Master mutatePayload function
// ---------------------------------------------------------------------------

/**
 * Apply one or more mutations to a payload string.
 *
 * @param {string} text - Original payload text
 * @param {Object} options
 * @param {boolean} [options.base64Wrap=false]        - Encode entire payload as base64
 * @param {boolean} [options.zeroWidthChars=false]    - Insert zero-width chars
 * @param {boolean} [options.homoglyphs=false]        - Replace chars with homoglyphs
 * @param {boolean} [options.randomCase=false]        - Randomize letter casing
 * @param {boolean} [options.unicodeObfuscate=false]  - Apply Unicode decomposition tricks
 * @param {boolean} [options.urlEncode=false]         - URL-encode the text
 * @param {boolean} [options.hexEncode=false]         - Hex-encode the text
 * @param {boolean} [options.rot13=false]             - Apply ROT13
 * @param {boolean} [options.chunkSplit=false]        - Split into newline-separated chunks
 * @param {boolean} [options.linguisticWrap=false]    - Wrap in innocuous-looking prompt
 * @param {boolean} [options.obfuscateSSN=false]      - Replace SSN with variant format
 * @param {string}  [options.ssnPattern]              - The SSN to obfuscate (e.g. '123-45-6789')
 * @returns {string} Mutated payload
 */
function mutatePayload(text, options = {}) {
  let result = text;

  if (options.obfuscateSSN && options.ssnPattern) {
    result = result.replace(options.ssnPattern, obfuscateSSN(options.ssnPattern));
  }

  if (options.randomCase) {
    result = randomizeCase(result);
  }

  if (options.unicodeObfuscate) {
    result = unicodeNormalizationObfuscate(result);
  }

  if (options.homoglyphs) {
    result = applyHomoglyphs(result);
  }

  if (options.zeroWidthChars) {
    result = insertZeroWidthChars(result);
  }

  if (options.chunkSplit) {
    result = chunkSplit(result, 4, '\u200B');
  }

  if (options.linguisticWrap) {
    result = linguisticWrap(result);
  }

  if (options.rot13) {
    result = rot13(result);
  }

  if (options.urlEncode) {
    result = urlEncode(result);
  }

  if (options.hexEncode) {
    result = hexEncode(result);
  }

  if (options.base64Wrap) {
    result = encodeBase64(result, 'base64:');
  }

  return result;
}

/**
 * Generate all standard mutation variants of a payload.
 * Returns an array of { label, payload } objects.
 */
function generateAllMutations(text, ssnPattern) {
  return [
    { label: 'original',         payload: text },
    { label: 'base64',           payload: mutatePayload(text, { base64Wrap: true }) },
    { label: 'zero-width',       payload: mutatePayload(text, { zeroWidthChars: true }) },
    { label: 'homoglyphs',       payload: mutatePayload(text, { homoglyphs: true }) },
    { label: 'random-case',      payload: mutatePayload(text, { randomCase: true }) },
    { label: 'unicode',          payload: mutatePayload(text, { unicodeObfuscate: true }) },
    { label: 'hex',              payload: mutatePayload(text, { hexEncode: true }) },
    { label: 'rot13',            payload: mutatePayload(text, { rot13: true }) },
    { label: 'url-encoded',      payload: mutatePayload(text, { urlEncode: true }) },
    { label: 'chunk-split',      payload: mutatePayload(text, { chunkSplit: true }) },
    { label: 'linguistic-wrap',  payload: mutatePayload(text, { linguisticWrap: true }) },
    { label: 'combined',         payload: mutatePayload(text, { homoglyphs: true, zeroWidthChars: true, randomCase: true }) },
    ...(ssnPattern ? [{
      label: 'ssn-obfuscated',
      payload: mutatePayload(text, { obfuscateSSN: true, ssnPattern }),
    }] : []),
  ];
}

module.exports = {
  mutatePayload,
  generateAllMutations,
  encodeBase64,
  decodeBase64,
  insertZeroWidthChars,
  applyHomoglyphs,
  obfuscateSSN,
  randomizeCase,
  unicodeNormalizationObfuscate,
  urlEncode,
  hexEncode,
  rot13,
  chunkSplit,
  linguisticWrap,
  HOMOGLYPH_MAP,
  ZERO_WIDTH_CHARS,
};
